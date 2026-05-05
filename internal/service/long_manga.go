package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/llm"
	"github.com/aimerneige/muse-oracle-engine/pkg/mdutil"
)

// LongMangaService handles multi-round long manga story generation.
type LongMangaService struct {
	llmProvider  llm.Provider
	promptEngine *prompt.Engine
}

// NewLongMangaService creates a new long manga generation service.
func NewLongMangaService(provider llm.Provider, engine *prompt.Engine) *LongMangaService {
	return &LongMangaService{
		llmProvider:  provider,
		promptEngine: engine,
	}
}

// GenerateOutline creates a human-confirmable outline state.
func (s *LongMangaService) GenerateOutline(ctx context.Context, project *domain.Project) (*domain.LongMangaState, error) {
	promptText, err := s.promptEngine.RenderLongMangaOutline(prompt.LongMangaOutlineData{
		Characters: project.Characters,
		PlotHint:   project.PlotHint,
		Language:   domain.NormalizeLanguage(project.Language),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to render long manga outline prompt: %w", err)
	}

	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return nil, fmt.Errorf("long manga outline generation failed: %w", err)
	}

	outline, err := parseLongMangaJSON[domain.LongMangaOutline](response)
	if err != nil {
		return nil, fmt.Errorf("failed to parse long manga outline: %w", err)
	}
	if err := normalizeOutline(&outline, candidateCharacterSet(project.Characters)); err != nil {
		return nil, err
	}

	now := time.Now()
	return &domain.LongMangaState{
		ProjectID:           project.ID,
		Status:              domain.LongMangaStatusOutlineGenerated,
		PlotHint:            project.PlotHint,
		Style:               project.Style,
		Language:            domain.NormalizeLanguage(project.Language),
		CandidateCharacters: longMangaCharacterRefs(project.Characters),
		Outline:             &outline,
		RawResponses:        map[string]string{"outline": response},
		CreatedAt:           now,
		UpdatedAt:           now,
	}, nil
}

// ConfirmOutline stores the human-confirmed outline for later episode generation.
func (s *LongMangaService) ConfirmOutline(state *domain.LongMangaState, outline domain.LongMangaOutline) error {
	characters := characterRefSet(state.CandidateCharacters)
	if err := normalizeOutline(&outline, characters); err != nil {
		return err
	}

	state.ConfirmedOutline = &outline
	state.Status = domain.LongMangaStatusOutlineConfirmed
	state.Error = ""
	state.UpdatedAt = time.Now()
	return nil
}

// GenerateEpisode expands one confirmed episode outline into a storyboard script.
func (s *LongMangaService) GenerateEpisode(ctx context.Context, project *domain.Project, state *domain.LongMangaState, episodeNumber int) error {
	if state.ConfirmedOutline == nil {
		return fmt.Errorf("confirmed outline is required")
	}

	episode, ok := findEpisodeOutline(*state.ConfirmedOutline, episodeNumber)
	if !ok {
		return fmt.Errorf("episode %d not found in confirmed outline", episodeNumber)
	}

	styleDescription, err := storyboardStyleDescription(project.Style)
	if err != nil {
		return err
	}

	characters, err := resolveEpisodeCharacters(project.Characters, episode.CharacterIDs)
	if err != nil {
		return err
	}

	promptText, err := s.promptEngine.RenderLongMangaEpisode(prompt.LongMangaEpisodeData{
		Characters:       characters,
		FullOutline:      *state.ConfirmedOutline,
		Episode:          episode,
		Language:         domain.NormalizeLanguage(project.Language),
		StyleDescription: styleDescription,
	})
	if err != nil {
		return fmt.Errorf("failed to render long manga episode prompt: %w", err)
	}

	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return fmt.Errorf("long manga episode %d generation failed: %w", episodeNumber, err)
	}

	script, err := parseLongMangaJSON[domain.LongMangaEpisodeScript](response)
	if err != nil {
		return fmt.Errorf("failed to parse long manga episode %d: %w", episodeNumber, err)
	}
	if err := normalizeEpisodeScript(&script, episode, candidateCharacterSet(project.Characters)); err != nil {
		return err
	}

	script.RawResponse = response
	state.Episodes = upsertEpisodeScript(state.Episodes, script)
	state.Status = longMangaStatusFromEpisodes(state)
	state.Error = ""
	state.UpdatedAt = time.Now()
	if state.RawResponses == nil {
		state.RawResponses = make(map[string]string)
	}
	state.RawResponses[fmt.Sprintf("episode_%d", episodeNumber)] = response
	return nil
}

// GenerateAllEpisodes expands every confirmed episode outline.
func (s *LongMangaService) GenerateAllEpisodes(ctx context.Context, project *domain.Project, state *domain.LongMangaState) error {
	if state.ConfirmedOutline == nil {
		return fmt.Errorf("confirmed outline is required")
	}
	for _, episode := range state.ConfirmedOutline.Episodes {
		if hasEpisodeScript(state.Episodes, episode.Episode) {
			continue
		}
		if err := s.GenerateEpisode(ctx, project, state, episode.Episode); err != nil {
			state.Status = domain.LongMangaStatusFailed
			state.Error = err.Error()
			state.UpdatedAt = time.Now()
			return err
		}
	}
	return nil
}

// ApplyLongMangaStateToProject copies generated long manga scripts into the image pipeline shape.
func ApplyLongMangaStateToProject(project *domain.Project, state *domain.LongMangaState) error {
	if state.ConfirmedOutline == nil {
		return fmt.Errorf("confirmed outline is required")
	}
	if len(state.Episodes) == 0 {
		return fmt.Errorf("long manga state contains no generated episodes")
	}

	panels := make([]domain.StoryboardPanel, 0)
	for _, episode := range state.Episodes {
		for _, panel := range episode.Panels {
			panels = append(panels, domain.StoryboardPanel{
				Index:        len(panels) + 1,
				Content:      longMangaPanelContent(episode, panel),
				CharacterIDs: panel.CharacterIDs,
			})
		}
	}

	project.StoryResult = &domain.StoryResult{
		CharacterSetting: buildCharacterSetting(project.Characters),
		PlotOutline:      longMangaOutlineText(*state.ConfirmedOutline),
	}
	project.Storyboard = &domain.Storyboard{
		Panels: panels,
	}
	project.Status = domain.StatusStoryboardDone
	project.UpdatedAt = time.Now()
	return nil
}

func parseLongMangaJSON[T any](response string) (T, error) {
	var value T
	payload := strings.TrimSpace(response)
	blocks := mdutil.ExtractCodeBlocksWithFilter(response, "json")
	if len(blocks) > 0 {
		payload = strings.TrimSpace(blocks[0].Content)
	}

	if err := json.Unmarshal([]byte(payload), &value); err != nil {
		return value, err
	}
	return value, nil
}

func normalizeOutline(outline *domain.LongMangaOutline, validCharacters map[string]struct{}) error {
	if len(outline.Episodes) == 0 {
		return fmt.Errorf("long manga outline contains no episodes")
	}
	if outline.TotalEpisodes == 0 {
		outline.TotalEpisodes = len(outline.Episodes)
	}
	if outline.TotalEpisodes != len(outline.Episodes) {
		return fmt.Errorf("total_episodes %d does not match %d episode entries", outline.TotalEpisodes, len(outline.Episodes))
	}

	for i := range outline.Episodes {
		episode := &outline.Episodes[i]
		if episode.Episode == 0 {
			episode.Episode = i + 1
		}
		if strings.TrimSpace(episode.Title) == "" {
			return fmt.Errorf("episode %d missing title", episode.Episode)
		}
		if strings.TrimSpace(episode.Summary) == "" {
			return fmt.Errorf("episode %d missing summary", episode.Episode)
		}
		if err := validateCharacterIDs(episode.CharacterIDs, validCharacters); err != nil {
			return fmt.Errorf("episode %d has invalid characters: %w", episode.Episode, err)
		}
	}
	return nil
}

func normalizeEpisodeScript(script *domain.LongMangaEpisodeScript, outline domain.LongMangaEpisodeOutline, validCharacters map[string]struct{}) error {
	if script.Episode == 0 {
		script.Episode = outline.Episode
	}
	if script.Episode != outline.Episode {
		return fmt.Errorf("episode script number %d does not match requested episode %d", script.Episode, outline.Episode)
	}
	if strings.TrimSpace(script.Title) == "" {
		script.Title = outline.Title
	}
	if strings.TrimSpace(script.Summary) == "" {
		script.Summary = outline.Summary
	}
	if len(script.Panels) == 0 {
		return fmt.Errorf("episode %d contains no panels", script.Episode)
	}
	if err := validateCharacterIDs(script.CharacterIDs, validCharacters); err != nil {
		return fmt.Errorf("episode %d has invalid characters: %w", script.Episode, err)
	}

	for i := range script.Panels {
		panel := &script.Panels[i]
		if panel.Index == 0 {
			panel.Index = i + 1
		}
		if strings.TrimSpace(panel.Content) == "" {
			return fmt.Errorf("episode %d panel %d missing content", script.Episode, panel.Index)
		}
		if err := validateCharacterIDs(panel.CharacterIDs, validCharacters); err != nil {
			return fmt.Errorf("episode %d panel %d has invalid characters: %w", script.Episode, panel.Index, err)
		}
	}
	return nil
}

func validateCharacterIDs(ids []string, valid map[string]struct{}) error {
	for _, id := range ids {
		if _, ok := valid[id]; !ok {
			return fmt.Errorf("unknown character id %s", id)
		}
	}
	return nil
}

func candidateCharacterSet(characters []domain.Character) map[string]struct{} {
	result := make(map[string]struct{}, len(characters))
	for _, c := range characters {
		result[c.Series+"/"+c.ID] = struct{}{}
	}
	return result
}

func characterRefSet(refs []domain.LongMangaCharacterRef) map[string]struct{} {
	result := make(map[string]struct{}, len(refs))
	for _, ref := range refs {
		result[ref.ID] = struct{}{}
	}
	return result
}

func longMangaCharacterRefs(characters []domain.Character) []domain.LongMangaCharacterRef {
	refs := make([]domain.LongMangaCharacterRef, 0, len(characters))
	for _, c := range characters {
		refs = append(refs, domain.LongMangaCharacterRef{
			ID:     c.Series + "/" + c.ID,
			Name:   c.Name,
			NameEN: c.NameEN,
			Series: c.Series,
		})
	}
	return refs
}

func findEpisodeOutline(outline domain.LongMangaOutline, episodeNumber int) (domain.LongMangaEpisodeOutline, bool) {
	for _, episode := range outline.Episodes {
		if episode.Episode == episodeNumber {
			return episode, true
		}
	}
	return domain.LongMangaEpisodeOutline{}, false
}

func resolveEpisodeCharacters(characters []domain.Character, ids []string) ([]domain.Character, error) {
	byID := make(map[string]domain.Character, len(characters))
	for _, c := range characters {
		byID[c.Series+"/"+c.ID] = c
	}

	resolved := make([]domain.Character, 0, len(ids))
	for _, id := range ids {
		c, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("character not found for episode: %s", id)
		}
		resolved = append(resolved, c)
	}
	return resolved, nil
}

func upsertEpisodeScript(scripts []domain.LongMangaEpisodeScript, script domain.LongMangaEpisodeScript) []domain.LongMangaEpisodeScript {
	for i := range scripts {
		if scripts[i].Episode == script.Episode {
			scripts[i] = script
			return scripts
		}
	}
	return append(scripts, script)
}

func hasEpisodeScript(scripts []domain.LongMangaEpisodeScript, episodeNumber int) bool {
	for _, script := range scripts {
		if script.Episode == episodeNumber {
			return true
		}
	}
	return false
}

func longMangaStatusFromEpisodes(state *domain.LongMangaState) domain.LongMangaStatus {
	if state.ConfirmedOutline == nil {
		return state.Status
	}
	if len(state.Episodes) >= len(state.ConfirmedOutline.Episodes) {
		return domain.LongMangaStatusStoryboardDone
	}
	return domain.LongMangaStatusStoryboardPartial
}

func longMangaPanelContent(episode domain.LongMangaEpisodeScript, panel domain.LongMangaPanelScript) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("#### 【第 %d 话】%s\n\n", episode.Episode, episode.Title))
	sb.WriteString(panel.Content)
	return sb.String()
}

func longMangaOutlineText(outline domain.LongMangaOutline) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("**总规划话数**：共 %d 话\n\n", outline.TotalEpisodes))
	for _, episode := range outline.Episodes {
		sb.WriteString(fmt.Sprintf("- 第%d话：%s - %s\n", episode.Episode, episode.Title, episode.Summary))
	}
	return sb.String()
}
