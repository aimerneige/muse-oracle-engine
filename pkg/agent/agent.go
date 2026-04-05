package agent

import (
	"context"
	"embed"
	"fmt"

	"github.com/aimerneige/lovelive-manga-generator/pkg/llm"
)

//go:embed templates/*.md
var promptFS embed.FS

// Agent is responsible for calling LLM with the injected prompts.
type Agent struct {
	llmClient llm.Client
	model     string
}

// NewAgent initializes the Agent.
func NewAgent(llmClient llm.Client, model string) (*Agent, error) {
	return &Agent{
		llmClient: llmClient,
		model:     model,
	}, nil
}

// Generate runs an LLM generation using a specific prompt template file and user input.
// This allows you to use any markdown prompt stored in the templates directory without modifying the code.
func (a *Agent) Generate(ctx context.Context, promptFileName string, userInput string) (string, error) {
	promptBody, err := promptFS.ReadFile("templates/" + promptFileName)
	if err != nil {
		return "", fmt.Errorf("failed to read prompt %s: %w", promptFileName, err)
	}

	// We safely concatenate your base prompt rules with the user's specific plot/input.
	// We avoid using template.Parse to prevent syntax conflicts if your prompt contains {{...}}.
	fullPrompt := fmt.Sprintf("%s\n\n【用户输入/请求】：\n%s", string(promptBody), userInput)

	req := llm.Request{
		Model: a.model,
		Messages: []llm.Message{
			{Role: "user", Content: fullPrompt},
		},
	}

	resp, err := a.llmClient.Chat(ctx, req)
	if err != nil {
		return "", fmt.Errorf("llm generate failed: %w", err)
	}

	return resp.Content, nil
}
