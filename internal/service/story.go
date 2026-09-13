package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/llm"
)

// StoryService handles story and storyboard generation.
type StoryService struct {
	llmProvider  llm.Provider
	promptEngine *prompt.Engine
}

// NewStoryService creates a new story generation service.
func NewStoryService(provider llm.Provider, engine *prompt.Engine) *StoryService {
	return &StoryService{
		llmProvider:  provider,
		promptEngine: engine,
	}
}

// GenerateStoryboard generates the complete storyboard in a single LLM call.
// It renders the storybook prompt with character data and plot hint, calls the LLM once,
// and parses the returned JSON episodes into image-ready panels.
// CharacterSetting is generated programmatically from the character data for downstream use.
func (s *StoryService) GenerateStoryboard(ctx context.Context, project *domain.Project) error {
	// Render the storybook prompt with character data
	promptText, err := s.promptEngine.RenderStorybook(prompt.StorybookData{
		Characters: project.Characters,
		PlotHint:   project.PlotHint,
		Language:   domain.NormalizeLanguage(project.Language),
	})
	if err != nil {
		return fmt.Errorf("failed to render storybook prompt: %w", err)
	}

	// Call LLM — single call generates all storyboard panels
	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return fmt.Errorf("storyboard generation failed: %w", err)
	}

	// Save the raw response to the project directory for debugging
	projectDir := filepath.Join("data", "projects", project.ID)
	_ = os.MkdirAll(projectDir, 0755)
	responseFile := filepath.Join(projectDir, "storyboard_response.md")
	if writeErr := os.WriteFile(responseFile, []byte(response), 0644); writeErr != nil {
		log.Printf("[StoryService] WARNING: failed to write storyboard response: %v", writeErr)
	}

	// Parse response — each episode renders as one 9:16 four-panel image
	panels, err := parseStoryboard(response, candidateCharacterSet(project.Characters))
	if err != nil {
		return fmt.Errorf("failed to parse storyboard JSON: %w", err)
	}

	// Generate CharacterSetting programmatically from Characters data
	characterSetting := buildCharacterSetting(project.Characters)

	project.StoryResult = &domain.StoryResult{
		CharacterSetting: characterSetting,
		RawResponse:      response,
	}

	project.Storyboard = &domain.Storyboard{
		Panels:      panels,
		RawResponse: response,
	}

	project.Status = domain.StatusStoryboardDone
	return nil
}

type storyboardResponse struct {
	Episodes []domain.StoryboardEpisodeScript `json:"episodes"`
}

// parseStoryboard parses the standard storyboard JSON and flattens each episode
// into one image-ready panel.
func parseStoryboard(response string, validCharacters map[string]struct{}) ([]domain.StoryboardPanel, error) {
	var wrapped storyboardResponse
	if err := json.Unmarshal([]byte(jsonPayload(response)), &wrapped); err != nil {
		return nil, err
	}
	if len(wrapped.Episodes) == 0 {
		return nil, fmt.Errorf("storyboard contains no episodes")
	}

	panels := make([]domain.StoryboardPanel, 0, len(wrapped.Episodes))
	for i := range wrapped.Episodes {
		episode := &wrapped.Episodes[i]
		if err := normalizeStoryboardEpisode(episode, i+1, validCharacters); err != nil {
			return nil, err
		}
		panels = append(panels, domain.StoryboardPanel{
			Index:        i + 1,
			Content:      renderStoryboardEpisodeContent(*episode),
			CharacterIDs: episode.CharacterIDs,
		})
	}
	return panels, nil
}

func normalizeStoryboardEpisode(script *domain.StoryboardEpisodeScript, fallbackEpisode int, validCharacters map[string]struct{}) error {
	if script.Episode == 0 {
		script.Episode = fallbackEpisode
	}
	if strings.TrimSpace(script.Title) == "" {
		return fmt.Errorf("episode %d missing title", script.Episode)
	}
	if len(script.Panels) != domain.LongMangaPanelsPerEpisode {
		return fmt.Errorf("episode %d must contain exactly %d panels, got %d", script.Episode, domain.LongMangaPanelsPerEpisode, len(script.Panels))
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
	}
	return nil
}

// renderStoryboardEpisodeContent mirrors the web app's episode rendering so CLI and web produce identical prompts.
func renderStoryboardEpisodeContent(script domain.StoryboardEpisodeScript) string {
	lines := []string{fmt.Sprintf("#### 【第 %d 话】", script.Episode), ""}
	if strings.TrimSpace(script.Summary) != "" {
		lines = append(lines, "**梗概**："+script.Summary, "")
	}
	for i, panel := range script.Panels {
		if i > 0 {
			lines = append(lines, "")
		}
		lines = append(lines, panel.Content)
	}
	return strings.Join(lines, "\n")
}

// buildCharacterSetting generates a markdown character setting string from character data.
// This replaces the previous approach of extracting it from LLM output.
func buildCharacterSetting(characters []domain.Character) string {
	var sb strings.Builder
	sb.WriteString("> 注：此处设定不可变的生理特征，后续分镜中不再赘述\n")
	for _, c := range characters {
		sb.WriteString(fmt.Sprintf("\n- **%s**：\n", c.Name))
		sb.WriteString(fmt.Sprintf("  - **发型与发色**：%s / %s\n", c.Appearance.HairStyle, c.Appearance.HairColor))
		sb.WriteString(fmt.Sprintf("  - **眼型与瞳色**：%s / %s\n", c.Appearance.EyeShape, c.Appearance.EyeColor))
		sb.WriteString(fmt.Sprintf("  - **身高与身材**：%s / %s\n", c.Appearance.Height, c.Appearance.BodyType))
		sb.WriteString(fmt.Sprintf("  - **其他特征**：%s\n", c.Appearance.Other))
	}
	return sb.String()
}
