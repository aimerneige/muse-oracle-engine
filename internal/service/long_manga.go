package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
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

// LongMangaProgressStore persists generated scripts and state during long episode generation.
type LongMangaProgressStore interface {
	Save(state *domain.LongMangaState) error
	SaveEpisodeScript(projectID string, script domain.LongMangaEpisodeScript) (string, error)
	SaveEpisodeFailure(projectID string, episode domain.LongMangaEpisodeOutline, generationErr error) (string, error)
	SaveLongMangaPrompt(projectID string, name string, prompt string) (string, error)
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
	return s.GenerateOutlineWithStore(ctx, project, nil)
}

// GenerateOutlineWithStore creates a human-confirmable outline state and saves its prompt.
func (s *LongMangaService) GenerateOutlineWithStore(ctx context.Context, project *domain.Project, store LongMangaProgressStore) (*domain.LongMangaState, error) {
	promptText, err := s.promptEngine.RenderLongMangaOutline(prompt.LongMangaOutlineData{
		Characters: project.Characters,
		PlotHint:   project.PlotHint,
		Language:   domain.NormalizeLanguage(project.Language),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to render long manga outline prompt: %w", err)
	}
	if store != nil {
		if _, err := store.SaveLongMangaPrompt(project.ID, "long_outline_prompt", promptText); err != nil {
			return nil, err
		}
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
func (s *LongMangaService) GenerateEpisode(ctx context.Context, project *domain.Project, state *domain.LongMangaState, episodeNumber int, store LongMangaProgressStore) error {
	log.Printf("Generating long manga episode %d...", episodeNumber)
	script, err := s.generateEpisodeScript(ctx, project, state, episodeNumber, store)
	if err != nil {
		log.Printf("Long manga episode %d failed: %v", episodeNumber, err)
		if store != nil {
			if episode, ok := findEpisodeOutline(*state.ConfirmedOutline, episodeNumber); ok {
				if _, saveErr := store.SaveEpisodeFailure(project.ID, episode, err); saveErr != nil {
					return saveErr
				}
			}
		}
		return err
	}

	applyLongMangaEpisodeScript(state, script)
	if store != nil {
		if _, err := store.SaveEpisodeScript(project.ID, script); err != nil {
			return err
		}
		if err := store.Save(state); err != nil {
			return fmt.Errorf("failed to save long manga state after episode %d: %w", episodeNumber, err)
		}
	}
	log.Printf("Long manga episode %d done", episodeNumber)
	return nil
}

func (s *LongMangaService) generateEpisodeScript(ctx context.Context, project *domain.Project, state *domain.LongMangaState, episodeNumber int, store LongMangaProgressStore) (domain.LongMangaEpisodeScript, error) {
	if state.ConfirmedOutline == nil {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("confirmed outline is required")
	}

	episode, ok := findEpisodeOutline(*state.ConfirmedOutline, episodeNumber)
	if !ok {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("episode %d not found in confirmed outline", episodeNumber)
	}

	styleDescription, err := storyboardStyleDescription(project.Style)
	if err != nil {
		return domain.LongMangaEpisodeScript{}, err
	}

	characters, err := resolveEpisodeCharacters(project.Characters, episode.CharacterIDs)
	if err != nil {
		return domain.LongMangaEpisodeScript{}, err
	}

	promptText, err := s.promptEngine.RenderLongMangaEpisode(prompt.LongMangaEpisodeData{
		Characters:        characters,
		CharacterCostumes: episodeCostumeStates(state.CharacterCostumes, episode.CharacterIDs),
		FullOutline:       *state.ConfirmedOutline,
		Episode:           episode,
		Language:          domain.NormalizeLanguage(project.Language),
		StyleDescription:  styleDescription,
	})
	if err != nil {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("failed to render long manga episode prompt: %w", err)
	}
	if store != nil {
		if _, err := store.SaveLongMangaPrompt(project.ID, fmt.Sprintf("long_episode_%03d_prompt", episodeNumber), promptText); err != nil {
			return domain.LongMangaEpisodeScript{}, err
		}
	}

	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("long manga episode %d generation failed: %w", episodeNumber, err)
	}

	script, err := parseLongMangaJSON[domain.LongMangaEpisodeScript](response)
	if err != nil {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("failed to parse long manga episode %d: %w", episodeNumber, err)
	}
	if err := normalizeEpisodeScript(&script, episode, candidateCharacterSet(project.Characters)); err != nil {
		return domain.LongMangaEpisodeScript{}, err
	}

	script.RawResponse = response
	return script, nil
}

// GenerateAllEpisodes expands every confirmed episode outline.
func (s *LongMangaService) GenerateAllEpisodes(ctx context.Context, project *domain.Project, state *domain.LongMangaState, store LongMangaProgressStore) error {
	if state.ConfirmedOutline == nil {
		return fmt.Errorf("confirmed outline is required")
	}

	jobs := pendingLongMangaEpisodes(*state.ConfirmedOutline, state.Episodes)
	if len(jobs) == 0 {
		log.Println("All long manga episodes are already generated, skipping")
		return nil
	}

	log.Printf("Starting long manga episode generation with %d pending episode(s), sequential costume continuity enabled", len(jobs))
	var failedEpisodes []string
	for _, episode := range jobs {
		log.Printf("Generating long manga episode %d/%d...", episode.Episode, state.ConfirmedOutline.TotalEpisodes)
		script, err := s.generateEpisodeScript(ctx, project, state, episode.Episode, store)
		if err != nil {
			failedEpisodes = append(failedEpisodes, fmt.Sprintf("episode %d: %v", episode.Episode, err))
			state.Status = domain.LongMangaStatusStoryboardPartial
			state.Error = strings.Join(failedEpisodes, "; ")
			state.UpdatedAt = time.Now()
			if store != nil {
				if _, saveErr := store.SaveEpisodeFailure(project.ID, episode, err); saveErr != nil {
					return fmt.Errorf("failed to save long manga episode %d failure: %w", episode.Episode, saveErr)
				}
				if saveErr := store.Save(state); saveErr != nil {
					return fmt.Errorf("%w; additionally failed to save failed long manga state: %v", err, saveErr)
				}
			}
			log.Printf("Long manga episode %d failed: %v", episode.Episode, err)
			continue
		}

		applyLongMangaEpisodeScript(state, script)
		log.Printf("Long manga episode %d done", episode.Episode)
		if store != nil {
			if _, err := store.SaveEpisodeScript(project.ID, script); err != nil {
				return fmt.Errorf("failed to save long manga episode %d script: %w", episode.Episode, err)
			}
			if err := store.Save(state); err != nil {
				return fmt.Errorf("failed to save long manga state after episode %d: %w", episode.Episode, err)
			}
		}
	}

	if len(failedEpisodes) > 0 {
		state.Status = domain.LongMangaStatusStoryboardPartial
		state.Error = strings.Join(failedEpisodes, "; ")
		state.UpdatedAt = time.Now()
		if store != nil {
			if err := store.Save(state); err != nil {
				return fmt.Errorf("failed to save partial long manga state: %w", err)
			}
		}
		log.Printf("Finished long manga episode generation for project %s with %d failed episode(s)", project.ID, len(failedEpisodes))
		return nil
	}

	state.Status = domain.LongMangaStatusStoryboardDone
	state.Error = ""
	state.UpdatedAt = time.Now()
	if store != nil {
		if err := store.Save(state); err != nil {
			return fmt.Errorf("failed to save completed long manga state: %w", err)
		}
	}
	log.Printf("Finished long manga episode generation for project %s", project.ID)
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
		panels = append(panels, domain.StoryboardPanel{
			Index:        len(panels) + 1,
			Content:      longMangaEpisodeContent(episode),
			CharacterIDs: episode.CharacterIDs,
		})
	}

	project.StoryResult = &domain.StoryResult{
		CharacterSetting: buildCharacterSetting(project.Characters),
		PlotOutline:      longMangaOutlineText(*state.ConfirmedOutline),
	}
	project.Storyboard = &domain.Storyboard{
		Panels: panels,
	}
	project.Images = nil
	project.Status = domain.StatusStoryboardDone
	project.ReviewFeedback = ""
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
	if err := normalizeCostumeStates(&script.CostumeStates, characterIDSet(script.CharacterIDs)); err != nil {
		return fmt.Errorf("episode %d has invalid costume states: %w", script.Episode, err)
	}
	return nil
}

func normalizeCostumeStates(states *[]domain.LongMangaCostumeState, validCharacters map[string]struct{}) error {
	normalized := make([]domain.LongMangaCostumeState, 0, len(*states))
	for _, state := range *states {
		state.CharacterID = strings.TrimSpace(state.CharacterID)
		state.Outfit = strings.TrimSpace(state.Outfit)
		state.UpdateReason = strings.TrimSpace(state.UpdateReason)
		if state.CharacterID == "" && state.Outfit == "" {
			continue
		}
		if _, ok := validCharacters[state.CharacterID]; !ok {
			return fmt.Errorf("unknown character id %s", state.CharacterID)
		}
		if state.Outfit == "" {
			return fmt.Errorf("character %s missing outfit", state.CharacterID)
		}
		normalized = append(normalized, state)
	}
	*states = normalized
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

func characterIDSet(ids []string) map[string]struct{} {
	result := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		result[id] = struct{}{}
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
			sortLongMangaEpisodeScripts(scripts)
			return scripts
		}
	}
	scripts = append(scripts, script)
	sortLongMangaEpisodeScripts(scripts)
	return scripts
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

func pendingLongMangaEpisodes(outline domain.LongMangaOutline, scripts []domain.LongMangaEpisodeScript) []domain.LongMangaEpisodeOutline {
	pending := make([]domain.LongMangaEpisodeOutline, 0, len(outline.Episodes))
	for _, episode := range outline.Episodes {
		if hasEpisodeScript(scripts, episode.Episode) {
			log.Printf("Long manga episode %d already generated, skipping", episode.Episode)
			continue
		}
		pending = append(pending, episode)
	}
	return pending
}

func episodeCostumeStates(states []domain.LongMangaCostumeState, episodeCharacterIDs []string) []domain.LongMangaCostumeState {
	allowed := make(map[string]struct{}, len(episodeCharacterIDs))
	for _, id := range episodeCharacterIDs {
		allowed[id] = struct{}{}
	}
	result := make([]domain.LongMangaCostumeState, 0, len(states))
	for _, state := range states {
		if _, ok := allowed[state.CharacterID]; ok {
			result = append(result, state)
		}
	}
	return result
}

func applyLongMangaEpisodeScript(state *domain.LongMangaState, script domain.LongMangaEpisodeScript) {
	state.Episodes = upsertEpisodeScript(state.Episodes, script)
	state.CharacterCostumes = mergeLongMangaCostumeStates(state.CharacterCostumes, script.CostumeStates)
	state.Status = longMangaStatusFromEpisodes(state)
	state.Error = ""
	state.UpdatedAt = time.Now()
	if state.RawResponses == nil {
		state.RawResponses = make(map[string]string)
	}
	state.RawResponses[fmt.Sprintf("episode_%d", script.Episode)] = script.RawResponse
}

func mergeLongMangaCostumeStates(current []domain.LongMangaCostumeState, updates []domain.LongMangaCostumeState) []domain.LongMangaCostumeState {
	if len(updates) == 0 {
		return current
	}

	byID := make(map[string]int, len(current))
	for i, state := range current {
		byID[state.CharacterID] = i
	}
	for _, update := range updates {
		if i, ok := byID[update.CharacterID]; ok {
			current[i] = update
			continue
		}
		byID[update.CharacterID] = len(current)
		current = append(current, update)
	}
	sort.Slice(current, func(i, j int) bool {
		return current[i].CharacterID < current[j].CharacterID
	})
	return current
}

func sortLongMangaEpisodeScripts(scripts []domain.LongMangaEpisodeScript) {
	sort.Slice(scripts, func(i, j int) bool {
		return scripts[i].Episode < scripts[j].Episode
	})
}

func longMangaEpisodeContent(episode domain.LongMangaEpisodeScript) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("#### 【第 %d 话】\n\n", episode.Episode))
	if episode.Summary != "" {
		sb.WriteString(fmt.Sprintf("**梗概**：%s\n\n", episode.Summary))
	}
	for i, panel := range episode.Panels {
		if i > 0 {
			sb.WriteString("\n\n")
		}
		sb.WriteString(panel.Content)
	}
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
