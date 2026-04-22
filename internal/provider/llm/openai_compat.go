package llm

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

// OpenAICompatAdapter implements Provider for any OpenAI-compatible API.
// This works with any service that exposes
// an OpenAI-compatible chat completion endpoint.
type OpenAICompatAdapter struct {
	client       *openai.Client
	model        string
	providerName string
}

// NewOpenAICompatAdapter creates a generic OpenAI-compatible LLM provider.
//
// Parameters:
//   - providerName: human-readable name for logging (e.g. "openai-proxy")
//   - baseURL: the API base URL
//   - apiKey: the API key
//   - model: the model identifier string (e.g. "google/gemini-2.5-pro")
func NewOpenAICompatAdapter(providerName, baseURL, apiKey, model string) *OpenAICompatAdapter {
	client := openai.NewClient(
		option.WithAPIKey(apiKey),
		option.WithBaseURL(baseURL),
	)
	return &OpenAICompatAdapter{
		client:       &client,
		model:        model,
		providerName: providerName,
	}
}

func (a *OpenAICompatAdapter) Name() string {
	return fmt.Sprintf("%s/%s", a.providerName, a.model)
}

func (a *OpenAICompatAdapter) GenerateText(ctx context.Context, prompt string) (string, error) {
	completion, err := a.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:    a.model,
		Messages: []openai.ChatCompletionMessageParamUnion{openai.UserMessage(prompt)},
	})
	if err != nil {
		return "", err
	}
	if len(completion.Choices) == 0 {
		return "", fmt.Errorf("%s: no choices in response", a.providerName)
	}
	return completion.Choices[0].Message.Content, nil
}

func (a *OpenAICompatAdapter) GenerateTextWithHistory(ctx context.Context, history History) (string, error) {
	messages := make([]openai.ChatCompletionMessageParamUnion, 0, len(history))
	for _, msg := range history {
		switch msg.Role {
		case RoleUser:
			messages = append(messages, openai.UserMessage(msg.Content))
		case RoleAssistant:
			messages = append(messages, openai.AssistantMessage(msg.Content))
		case RoleSystem:
			messages = append(messages, openai.SystemMessage(msg.Content))
		}
	}
	completion, err := a.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:    a.model,
		Messages: messages,
	})
	if err != nil {
		return "", err
	}
	if len(completion.Choices) == 0 {
		return "", fmt.Errorf("%s: no choices in response", a.providerName)
	}
	return completion.Choices[0].Message.Content, nil
}
