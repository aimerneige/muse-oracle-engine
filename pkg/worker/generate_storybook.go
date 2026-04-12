package worker

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/aimerneige/lovelive-manga-generator/pkg/llm"
	"github.com/aimerneige/lovelive-manga-generator/pkg/worker/utils"
)

//go:embed prompts/generate_storybook.md
var generateStorybookPrompt string

type Step1Response struct {
	Character string
	Overview  string
}

func GenerateStorybookStep1(ctx context.Context, storyHint string, llmProvider llm.LLMProvider) (*llm.History, *Step1Response, error) {
	userPrompt := generateStorybookPrompt + "\n\n" + storyHint

	aiResponse, err := llmProvider.GenerateText(ctx, userPrompt)
	if err != nil {
		return nil, nil, err
	}

	blocks := utils.ExtractCodeBlocks(aiResponse)

	if len(blocks) != 2 {
		return nil, nil, fmt.Errorf("LLM Error: Expected 2 code blocks, got %d", len(blocks))
	}

	history := &llm.History{
		{Role: llm.RoleUser, Content: userPrompt},
		{Role: llm.RoleAssistant, Content: aiResponse},
	}

	step1Resp := &Step1Response{
		Character: blocks[0].Content,
		Overview:  blocks[1].Content,
	}

	return history, step1Resp, err
}
