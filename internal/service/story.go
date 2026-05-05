package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/llm"
	"github.com/aimerneige/muse-oracle-engine/pkg/mdutil"
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
// and parses the code blocks as storyboard panels.
// CharacterSetting is generated programmatically from the character data for downstream use.
func (s *StoryService) GenerateStoryboard(ctx context.Context, project *domain.Project) error {
	styleDescription, err := storyboardStyleDescription(project.Style)
	if err != nil {
		return err
	}

	// Render the storybook prompt with character data
	promptText, err := s.promptEngine.RenderStorybook(prompt.StorybookData{
		Characters:       project.Characters,
		PlotHint:         project.PlotHint,
		Language:         domain.NormalizeLanguage(project.Language),
		StyleDescription: styleDescription,
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

	// Parse response — each code block is one panel/episode
	blocks := mdutil.ExtractCodeBlocks(response)
	if len(blocks) == 0 {
		return fmt.Errorf("LLM returned no code blocks for storyboard")
	}

	// Build storyboard panels
	panels := make([]domain.StoryboardPanel, 0, len(blocks))
	for i, block := range blocks {
		panels = append(panels, domain.StoryboardPanel{
			Index:   i + 1,
			Content: block.Content,
		})
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

func storyboardStyleDescription(style domain.ComicStyle) (string, error) {
	meta, ok := domain.StyleRegistry[style]
	if !ok {
		return "", fmt.Errorf("unknown comic style: %s", style)
	}

	description := strings.TrimSpace(meta.Description)
	if description == "" {
		return "", fmt.Errorf("comic style %s missing description", style)
	}
	if len([]rune(description)) > 100 {
		return "", fmt.Errorf("comic style %s description must be 100 characters or fewer", style)
	}
	return description, nil
}

// buildCharacterSetting generates a markdown character setting string from character data.
// This replaces the previous approach of extracting it from LLM output.
func buildCharacterSetting(characters []domain.Character) string {
	var sb strings.Builder
	sb.WriteString("### 全局固有生理特征设定：(注：此处设定不可变的生理特征，后续分镜中不再赘述)\n")
	for _, c := range characters {
		sb.WriteString(fmt.Sprintf("\n- **%s**：\n", c.Name))
		sb.WriteString(fmt.Sprintf("  - **发型与发色**：%s / %s\n", c.Appearance.HairStyle, c.Appearance.HairColor))
		sb.WriteString(fmt.Sprintf("  - **眼型与瞳色**：%s / %s\n", c.Appearance.EyeShape, c.Appearance.EyeColor))
		sb.WriteString(fmt.Sprintf("  - **身高与身材**：%s / %s\n", c.Appearance.Height, c.Appearance.BodyType))
		sb.WriteString(fmt.Sprintf("  - **其他特征**：%s\n", c.Appearance.Other))
	}
	return sb.String()
}
