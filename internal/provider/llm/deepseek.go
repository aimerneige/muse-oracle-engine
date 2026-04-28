package llm

import (
	"context"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

// DeepSeekModel enumerates supported DeepSeek model variants.
type DeepSeekModel int

const (
	DeepSeekChat DeepSeekModel = iota
	DeepSeekReasoner
	DeepSeekV4Flash
	DeepSeekV4Pro
)

func (m DeepSeekModel) String() string {
	switch m {
	case DeepSeekChat:
		return "deepseek-chat"
	case DeepSeekReasoner:
		return "deepseek-reasoner"
	case DeepSeekV4Flash:
		return "deepseek-v4-flash"
	case DeepSeekV4Pro:
		return "deepseek-v4-pro"
	default:
		return ""
	}
}

// DeepSeekAdapter implements Provider using the DeepSeek API.
type DeepSeekAdapter struct {
	client *openai.Client
	model  DeepSeekModel
}

// NewDeepSeekAdapter creates a new DeepSeek LLM provider.
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

func (d *DeepSeekAdapter) Name() string {
	return "deepseek/" + d.model.String()
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

func (d *DeepSeekAdapter) GenerateTextWithHistory(ctx context.Context, history History) (string, error) {
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
	completion, err := d.client.Chat.Completions.New(ctx, openai.ChatCompletionNewParams{
		Model:    d.model.String(),
		Messages: messages,
	})
	if err != nil {
		return "", err
	}
	if len(completion.Choices) == 0 {
		return "", nil
	}

	return completion.Choices[0].Message.Content, nil
}
