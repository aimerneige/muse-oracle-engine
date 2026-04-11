package llm

import (
	"context"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

type DeepSeekModel int

const (
	DeepSeekChat DeepSeekModel = iota
	DeepSeekReasoner
)

func (m DeepSeekModel) String() string {
	switch m {
	case DeepSeekChat:
		return "deepseek-chat"
	case DeepSeekReasoner:
		return "deepseek-reasoner"
	default:
		return ""
	}
}

type DeepSeekAdapter struct {
	client *openai.Client
	model  DeepSeekModel
}

func NewDeepSeekAdapter(apiKey string, model DeepSeekModel) *DeepSeekAdapter {
	client := openai.NewClient(
		option.WithAPIKey(apiKey),
		option.WithBaseURL("https://api.deepseek.com"),
	)
	return &DeepSeekAdapter{
		client: &client,
		model:  model,
	}
}

func (d *DeepSeekAdapter) GenerateText(ctx context.Context, prompt string) (string, error) {
	completion, err := d.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:    d.model.String(),
		Messages: []openai.ChatCompletionMessageParamUnion{openai.UserMessage(prompt)},
	})
	if err != nil {
		return "", err
	}
	return completion.Choices[0].Message.Content, nil
}
