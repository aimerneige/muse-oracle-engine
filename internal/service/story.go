package service

import (
	"context"
	"fmt"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
	"github.com/aimerneige/lovelive-manga-generator/internal/prompt"
	"github.com/aimerneige/lovelive-manga-generator/internal/provider/llm"
	"github.com/aimerneige/lovelive-manga-generator/pkg/mdutil"
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

// GenerateStory executes step 1: generate story outline and character settings.
// Returns the updated project with StoryResult filled and conversation history set.
func (s *StoryService) GenerateStory(ctx context.Context, project *domain.Project) error {
	// Render the storybook prompt with character data
	promptText, err := s.promptEngine.RenderStorybook(prompt.StorybookData{
		Characters: project.Characters,
		PlotHint:   project.PlotHint,
	})
	if err != nil {
		return fmt.Errorf("failed to render storybook prompt: %w", err)
	}

	// Call LLM
	response, err := s.llmProvider.GenerateText(ctx, promptText)
	if err != nil {
		return fmt.Errorf("story generation failed: %w", err)
	}

	// Parse response — expect 2 code blocks: character setting + plot outline
	blocks := mdutil.ExtractCodeBlocks(response)
	if len(blocks) < 2 {
		return fmt.Errorf("LLM returned %d code blocks, expected at least 2", len(blocks))
	}

	// Save results
	project.StoryResult = &domain.StoryResult{
		CharacterSetting: blocks[0].Content,
		PlotOutline:      blocks[1].Content,
		RawResponse:      response,
	}

	// Save conversation history for step 2
	project.History = []domain.HistoryMessage{
		{Role: "user", Content: promptText},
		{Role: "assistant", Content: response},
	}

	project.Status = domain.StatusStoryDone
	return nil
}

// GenerateStoryboard executes step 2: generate detailed storyboard panels.
// Requires StoryResult from step 1. Returns storyboard panels.
func (s *StoryService) GenerateStoryboard(ctx context.Context, project *domain.Project) error {
	if project.StoryResult == nil {
		return fmt.Errorf("story result is required — run step 1 first")
	}

	// Build conversation history from step 1 and append the generation request
	history := make(llm.History, 0, len(project.History)+1)
	for _, msg := range project.History {
		history = append(history, llm.Message{
			Role:    llm.MessageRole(msg.Role),
			Content: msg.Content,
		})
	}
	history = append(history, llm.Message{
		Role:    llm.RoleUser,
		Content: "一次性生成全部",
	})

	// Call LLM with history
	response, err := s.llmProvider.GenerateTextWithHistory(ctx, history)
	if err != nil {
		return fmt.Errorf("storyboard generation failed: %w", err)
	}

	// Parse response — each code block is one panel/episode
	blocks := mdutil.ExtractCodeBlocks(response)
	if len(blocks) == 0 {
		return fmt.Errorf("LLM returned no code blocks for storyboard")
	}

	// Build storyboard
	panels := make([]domain.StoryboardPanel, 0, len(blocks))
	for i, block := range blocks {
		panels = append(panels, domain.StoryboardPanel{
			Index:   i + 1,
			Content: block.Content,
		})
	}

	project.Storyboard = &domain.Storyboard{
		Panels:      panels,
		RawResponse: response,
	}

	project.Status = domain.StatusStoryboardDone
	return nil
}
