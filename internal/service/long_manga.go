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

type mangaGenerationMode string

const (
	longMangaGenerationMode   mangaGenerationMode = "long manga"
	fourPanelGenerationMode   mangaGenerationMode = "four-panel manga"
	maxLongMangaStoryAttempts                     = 3
)

type longMangaBatchStoryboardResponse struct {
	Episodes []domain.LongMangaEpisodeScript `json:"episodes"`
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
	return s.generateOutline(ctx, project, store, longMangaGenerationMode)
}

// GenerateFourPanelOutlineWithStore creates selectable independent four-panel story candidates.
func (s *LongMangaService) GenerateFourPanelOutlineWithStore(ctx context.Context, project *domain.Project, store LongMangaProgressStore) (*domain.LongMangaState, error) {
	return s.generateOutline(ctx, project, store, fourPanelGenerationMode)
}

func (s *LongMangaService) generateOutline(ctx context.Context, project *domain.Project, store LongMangaProgressStore, mode mangaGenerationMode) (*domain.LongMangaState, error) {
	promptText, err := s.renderOutlinePrompt(project, mode)
	if err != nil {
		return nil, fmt.Errorf("failed to render %s outline prompt: %w", mode, err)
	}
	if store != nil {
		if _, err := store.SaveLongMangaPrompt(project.ID, outlinePromptName(mode), promptText); err != nil {
			return nil, err
		}
	}

	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return nil, fmt.Errorf("%s outline generation failed: %w", mode, err)
	}

	outline, err := parseLongMangaJSON[domain.LongMangaOutline](response)
	if err != nil {
		return nil, fmt.Errorf("failed to parse %s outline: %w", mode, err)
	}
	if err := normalizeOutline(&outline, candidateCharacterSet(project.Characters)); err != nil {
		return nil, err
	}

	now := time.Now()
	return &domain.LongMangaState{
		ProjectID:           project.ID,
		Status:              domain.LongMangaStatusOutlineGenerated,
		PlotHint:            project.PlotHint,
		StoryLength:         project.StoryLength,
		Style:               project.Style,
		Language:            domain.NormalizeLanguage(project.Language),
		CandidateCharacters: longMangaCharacterRefs(project.Characters),
		Outline:             &outline,
		RawResponses:        map[string]string{"outline": response},
		CreatedAt:           now,
		UpdatedAt:           now,
	}, nil
}

func (s *LongMangaService) renderOutlinePrompt(project *domain.Project, mode mangaGenerationMode) (string, error) {
	if mode == fourPanelGenerationMode {
		return s.promptEngine.RenderFourPanelOutline(prompt.FourPanelOutlineData{
			Characters: project.Characters,
			PlotHint:   project.PlotHint,
			Language:   domain.NormalizeLanguage(project.Language),
		})
	}
	return s.promptEngine.RenderLongMangaOutline(prompt.LongMangaOutlineData{
		Characters:  project.Characters,
		PlotHint:    project.PlotHint,
		Language:    domain.NormalizeLanguage(project.Language),
		StoryLength: project.StoryLength,
		TotalPanels: project.StoryLength * domain.LongMangaPanelsPerEpisode,
	})
}

func outlinePromptName(mode mangaGenerationMode) string {
	if mode == fourPanelGenerationMode {
		return "four_panel_outline_prompt"
	}
	return "long_outline_prompt"
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

// SelectFourPanelStories returns only the requested independent story candidates.
func SelectFourPanelStories(outline domain.LongMangaOutline, storyNumbers []int) (domain.LongMangaOutline, error) {
	if len(storyNumbers) == 0 {
		return domain.LongMangaOutline{}, fmt.Errorf("select at least one four-panel story")
	}

	selected := make([]domain.LongMangaEpisodeOutline, 0, len(storyNumbers))
	seen := make(map[int]struct{}, len(storyNumbers))
	for _, storyNumber := range storyNumbers {
		if _, exists := seen[storyNumber]; exists {
			return domain.LongMangaOutline{}, fmt.Errorf("four-panel story %d was selected more than once", storyNumber)
		}
		episode, ok := findEpisodeOutline(outline, storyNumber)
		if !ok {
			return domain.LongMangaOutline{}, fmt.Errorf("four-panel story %d is not available", storyNumber)
		}
		seen[storyNumber] = struct{}{}
		selected = append(selected, episode)
	}

	return domain.LongMangaOutline{
		TotalEpisodes: len(selected),
		Episodes:      selected,
	}, nil
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
	return s.generateEpisodeScriptForMode(ctx, project, state, episodeNumber, store, longMangaGenerationMode)
}

func (s *LongMangaService) generateEpisodeScriptForMode(ctx context.Context, project *domain.Project, state *domain.LongMangaState, episodeNumber int, store LongMangaProgressStore, mode mangaGenerationMode) (domain.LongMangaEpisodeScript, error) {
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

	promptText, err := s.renderEpisodePrompt(project, state, episode, characters, styleDescription, mode)
	if err != nil {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("failed to render %s storyboard prompt: %w", mode, err)
	}
	if store != nil {
		if _, err := store.SaveLongMangaPrompt(project.ID, episodePromptName(mode, episodeNumber), promptText); err != nil {
			return domain.LongMangaEpisodeScript{}, err
		}
	}

	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("%s story %d generation failed: %w", mode, episodeNumber, err)
	}

	script, err := parseLongMangaJSON[domain.LongMangaEpisodeScript](response)
	if err != nil {
		return domain.LongMangaEpisodeScript{}, fmt.Errorf("failed to parse %s story %d: %w", mode, episodeNumber, err)
	}
	if err := normalizeEpisodeScript(&script, episode, candidateCharacterSet(project.Characters)); err != nil {
		return domain.LongMangaEpisodeScript{}, err
	}
	if mode == fourPanelGenerationMode {
		if err := validateFourPanelScript(script); err != nil {
			return domain.LongMangaEpisodeScript{}, err
		}
	}

	script.RawResponse = response
	return script, nil
}

func validateFourPanelScript(script domain.LongMangaEpisodeScript) error {
	if len(script.Panels) != 4 {
		return fmt.Errorf("four-panel story %d must contain exactly 4 panels, got %d", script.Episode, len(script.Panels))
	}

	for i, panel := range script.Panels {
		if panel.Index != i+1 {
			return fmt.Errorf("four-panel story %d panel indexes must be 1,2,3,4", script.Episode)
		}
		if hasStoryboardSubtitle(panel.Content) {
			return fmt.Errorf("four-panel story %d panel %d must not contain storyboard subtitles", script.Episode, panel.Index)
		}
	}
	return nil
}

func (s *LongMangaService) renderEpisodePrompt(project *domain.Project, state *domain.LongMangaState, episode domain.LongMangaEpisodeOutline, characters []domain.Character, styleDescription string, mode mangaGenerationMode) (string, error) {
	if mode == fourPanelGenerationMode {
		return s.promptEngine.RenderFourPanelStoryboard(prompt.FourPanelStoryboardData{
			Characters:       characters,
			Episode:          episode,
			Language:         domain.NormalizeLanguage(project.Language),
			StyleDescription: styleDescription,
		})
	}
	return s.promptEngine.RenderLongMangaEpisode(prompt.LongMangaEpisodeData{
		Characters:        characters,
		CharacterCostumes: episodeCostumeStates(state.CharacterCostumes, episode.CharacterIDs),
		FullOutline:       *state.ConfirmedOutline,
		Episode:           episode,
		Language:          domain.NormalizeLanguage(project.Language),
		StyleDescription:  styleDescription,
	})
}

func episodePromptName(mode mangaGenerationMode, episodeNumber int) string {
	if mode == fourPanelGenerationMode {
		return fmt.Sprintf("four_panel_story_%03d_prompt", episodeNumber)
	}
	return fmt.Sprintf("long_episode_%03d_prompt", episodeNumber)
}

// GenerateAllEpisodes expands every confirmed episode outline.
func (s *LongMangaService) GenerateAllEpisodes(ctx context.Context, project *domain.Project, state *domain.LongMangaState, store LongMangaProgressStore) error {
	return s.generateAllEpisodesForMode(ctx, project, state, store, longMangaGenerationMode)
}

// GenerateAllEpisodesBatch expands every confirmed episode outline with one LLM request.
func (s *LongMangaService) GenerateAllEpisodesBatch(ctx context.Context, project *domain.Project, state *domain.LongMangaState, store LongMangaProgressStore) error {
	if state.ConfirmedOutline == nil {
		return fmt.Errorf("confirmed outline is required")
	}
	if len(state.Episodes) >= len(state.ConfirmedOutline.Episodes) {
		log.Printf("All long manga storyboards are already generated, skipping")
		return nil
	}

	styleDescription, err := storyboardStyleDescription(project.Style)
	if err != nil {
		return err
	}
	promptText, err := s.promptEngine.RenderLongMangaBatchStoryboard(prompt.LongMangaBatchStoryboardData{
		Characters:       project.Characters,
		FullOutline:      *state.ConfirmedOutline,
		Language:         domain.NormalizeLanguage(project.Language),
		StyleDescription: styleDescription,
	})
	if err != nil {
		return fmt.Errorf("failed to render long manga batch storyboard prompt: %w", err)
	}
	if store != nil {
		if _, err := store.SaveLongMangaPrompt(project.ID, "long_batch_storyboard_prompt", promptText); err != nil {
			return err
		}
	}

	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return fmt.Errorf("long manga batch storyboard generation failed: %w", err)
	}

	scripts, err := parseLongMangaBatchStoryboard(response, *state.ConfirmedOutline, candidateCharacterSet(project.Characters))
	if err != nil {
		return fmt.Errorf("failed to parse long manga batch storyboard: %w", err)
	}
	for i := range scripts {
		scripts[i].RawResponse = response
		applyLongMangaEpisodeScript(state, scripts[i])
	}
	state.Status = domain.LongMangaStatusStoryboardDone
	state.Error = ""
	state.UpdatedAt = time.Now()
	if state.RawResponses == nil {
		state.RawResponses = make(map[string]string)
	}
	state.RawResponses["batch_storyboard"] = response

	if store != nil {
		for _, script := range scripts {
			if _, err := store.SaveEpisodeScript(project.ID, script); err != nil {
				return fmt.Errorf("failed to save long manga story %d script: %w", script.Episode, err)
			}
		}
		if err := store.Save(state); err != nil {
			return fmt.Errorf("failed to save completed long manga state: %w", err)
		}
	}
	log.Printf("Finished long manga batch storyboard generation for project %s", project.ID)
	return nil
}

// GenerateAllFourPanelStories expands every selected outline into one strict four-panel storyboard.
func (s *LongMangaService) GenerateAllFourPanelStories(ctx context.Context, project *domain.Project, state *domain.LongMangaState, store LongMangaProgressStore) error {
	return s.generateAllEpisodesForMode(ctx, project, state, store, fourPanelGenerationMode)
}

func (s *LongMangaService) generateEpisodeScriptForModeWithRetry(ctx context.Context, project *domain.Project, state *domain.LongMangaState, episodeNumber int, store LongMangaProgressStore, mode mangaGenerationMode) (domain.LongMangaEpisodeScript, error) {
	var lastErr error
	for attempt := 1; attempt <= maxLongMangaStoryAttempts; attempt++ {
		script, err := s.generateEpisodeScriptForMode(ctx, project, state, episodeNumber, store, mode)
		if err == nil {
			return script, nil
		}
		lastErr = err
		if attempt < maxLongMangaStoryAttempts {
			log.Printf("%s story %d attempt %d/%d failed: %v; retrying", mode, episodeNumber, attempt, maxLongMangaStoryAttempts, err)
		}
	}
	return domain.LongMangaEpisodeScript{}, fmt.Errorf("failed after %d attempt(s): %w", maxLongMangaStoryAttempts, lastErr)
}

func (s *LongMangaService) generateAllEpisodesForMode(ctx context.Context, project *domain.Project, state *domain.LongMangaState, store LongMangaProgressStore, mode mangaGenerationMode) error {
	if state.ConfirmedOutline == nil {
		return fmt.Errorf("confirmed outline is required")
	}

	jobs := pendingLongMangaEpisodes(*state.ConfirmedOutline, state.Episodes)
	if len(jobs) == 0 {
		log.Printf("All %s storyboards are already generated, skipping", mode)
		return nil
	}

	log.Printf("Starting %s storyboard generation with %d pending story/stories", mode, len(jobs))
	var failedEpisodes []string
	for _, episode := range jobs {
		log.Printf("Generating %s story %d...", mode, episode.Episode)
		script, err := s.generateEpisodeScriptForModeWithRetry(ctx, project, state, episode.Episode, store, mode)
		if err != nil {
			failedEpisodes = append(failedEpisodes, fmt.Sprintf("episode %d: %v", episode.Episode, err))
			state.Status = domain.LongMangaStatusStoryboardPartial
			state.Error = strings.Join(failedEpisodes, "; ")
			state.UpdatedAt = time.Now()
			if store != nil {
				if _, saveErr := store.SaveEpisodeFailure(project.ID, episode, err); saveErr != nil {
					return fmt.Errorf("failed to save %s story %d failure: %w", mode, episode.Episode, saveErr)
				}
				if saveErr := store.Save(state); saveErr != nil {
					return fmt.Errorf("%w; additionally failed to save failed long manga state: %v", err, saveErr)
				}
			}
			log.Printf("%s story %d failed: %v", mode, episode.Episode, err)
			continue
		}

		applyLongMangaEpisodeScript(state, script)
		log.Printf("%s story %d done", mode, episode.Episode)
		if store != nil {
			if _, err := store.SaveEpisodeScript(project.ID, script); err != nil {
				return fmt.Errorf("failed to save %s story %d script: %w", mode, episode.Episode, err)
			}
			if err := store.Save(state); err != nil {
				return fmt.Errorf("failed to save manga state after story %d: %w", episode.Episode, err)
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
		log.Printf("Finished %s storyboard generation for project %s with %d failed story/stories", mode, project.ID, len(failedEpisodes))
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
	log.Printf("Finished %s storyboard generation for project %s", mode, project.ID)
	return nil
}

// ApplyLongMangaStateToProject copies generated long manga scripts into the image pipeline shape.
func ApplyLongMangaStateToProject(project *domain.Project, state *domain.LongMangaState) error {
	return applyMangaStateToProject(project, state, longMangaEpisodeContent)
}

// ApplyFourPanelMangaStateToProject copies strict four-panel scripts without storyboard subtitles.
func ApplyFourPanelMangaStateToProject(project *domain.Project, state *domain.LongMangaState) error {
	return applyMangaStateToProject(project, state, fourPanelEpisodeContent)
}

func applyMangaStateToProject(project *domain.Project, state *domain.LongMangaState, episodeContent func(domain.LongMangaEpisodeScript) string) error {
	if state.ConfirmedOutline == nil {
		return fmt.Errorf("confirmed outline is required")
	}
	if len(state.Episodes) == 0 {
		return fmt.Errorf("long manga state contains no generated episodes")
	}

	panels := make([]domain.StoryboardPanel, 0)
	for _, episode := range state.Episodes {
		panels = append(panels, domain.StoryboardPanel{
			Index:        episode.Episode,
			Content:      episodeContent(episode),
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
	payload := longMangaJSONPayload(response)
	if err := json.Unmarshal([]byte(payload), &value); err != nil {
		return value, err
	}
	return value, nil
}

func longMangaJSONPayload(response string) string {
	payload := strings.TrimSpace(response)
	blocks := mdutil.ExtractCodeBlocksWithFilter(response, "json")
	if len(blocks) > 0 {
		payload = strings.TrimSpace(blocks[0].Content)
	}
	return payload
}

func parseLongMangaBatchStoryboard(response string, outline domain.LongMangaOutline, validCharacters map[string]struct{}) ([]domain.LongMangaEpisodeScript, error) {
	payload := longMangaJSONPayload(response)
	var wrapped longMangaBatchStoryboardResponse
	if err := json.Unmarshal([]byte(payload), &wrapped); err != nil {
		var scripts []domain.LongMangaEpisodeScript
		if arrayErr := json.Unmarshal([]byte(payload), &scripts); arrayErr != nil {
			return nil, err
		}
		wrapped.Episodes = scripts
	}
	if len(wrapped.Episodes) == 0 {
		return nil, fmt.Errorf("batch storyboard contains no episodes")
	}

	byEpisode := make(map[int]domain.LongMangaEpisodeScript, len(wrapped.Episodes))
	for _, script := range wrapped.Episodes {
		if script.Episode == 0 {
			return nil, fmt.Errorf("batch storyboard contains episode without number")
		}
		if _, exists := byEpisode[script.Episode]; exists {
			return nil, fmt.Errorf("batch storyboard contains duplicate episode %d", script.Episode)
		}
		byEpisode[script.Episode] = script
	}

	scripts := make([]domain.LongMangaEpisodeScript, 0, len(outline.Episodes))
	for _, episode := range outline.Episodes {
		script, ok := byEpisode[episode.Episode]
		if !ok {
			return nil, fmt.Errorf("batch storyboard missing episode %d", episode.Episode)
		}
		if err := normalizeEpisodeScript(&script, episode, validCharacters); err != nil {
			return nil, err
		}
		if err := validateBatchCostumeStates(script); err != nil {
			return nil, err
		}
		scripts = append(scripts, script)
		delete(byEpisode, episode.Episode)
	}
	if len(byEpisode) > 0 {
		extras := make([]int, 0, len(byEpisode))
		for episode := range byEpisode {
			extras = append(extras, episode)
		}
		sort.Ints(extras)
		return nil, fmt.Errorf("batch storyboard contains extra episode(s): %v", extras)
	}
	return scripts, nil
}

func validateBatchCostumeStates(script domain.LongMangaEpisodeScript) error {
	seen := make(map[string]struct{}, len(script.CostumeStates))
	for _, state := range script.CostumeStates {
		seen[state.CharacterID] = struct{}{}
	}
	for _, id := range script.CharacterIDs {
		if _, ok := seen[id]; !ok {
			return fmt.Errorf("episode %d missing costume state for %s", script.Episode, id)
		}
	}
	return nil
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

func fourPanelEpisodeContent(episode domain.LongMangaEpisodeScript) string {
	contents := make([]string, 0, len(episode.Panels))
	for _, panel := range episode.Panels {
		content := stripStoryboardSubtitles(panel.Content)
		if content != "" {
			contents = append(contents, content)
		}
	}
	return strings.Join(contents, "\n\n")
}

func stripStoryboardSubtitles(content string) string {
	lines := strings.Split(content, "\n")
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		if isStoryboardSubtitleLine(line) {
			continue
		}
		filtered = append(filtered, line)
	}
	return strings.TrimSpace(strings.Join(filtered, "\n"))
}

func hasStoryboardSubtitle(content string) bool {
	for _, line := range strings.Split(content, "\n") {
		if isStoryboardSubtitleLine(line) {
			return true
		}
	}
	return false
}

func isStoryboardSubtitleLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "#") {
		return true
	}
	for _, marker := range []string{"【起】", "【承】", "【转】", "【合】", "起：", "承：", "转：", "合：", "起:", "承:", "转:", "合:", "第1格", "第2格", "第3格", "第4格", "第 1 格", "第 2 格", "第 3 格", "第 4 格", "第一格", "第二格", "第三格", "第四格"} {
		if strings.HasPrefix(trimmed, marker) || strings.Contains(trimmed, marker) {
			return true
		}
	}
	return false
}

func longMangaOutlineText(outline domain.LongMangaOutline) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("**总规划话数**：共 %d 话\n\n", outline.TotalEpisodes))
	for _, episode := range outline.Episodes {
		sb.WriteString(fmt.Sprintf("- 第%d话：%s - %s\n", episode.Episode, episode.Title, episode.Summary))
	}
	return sb.String()
}
