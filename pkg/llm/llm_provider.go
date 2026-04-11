package llm

import (
	"context"
)

type MessageRole string

const (
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
	RoleSystem    MessageRole = "system"
)

type Message struct {
	Role    MessageRole
	Content string
}

type LLMProvider interface {
	GenerateText(ctx context.Context, prompt string) (string, error)
	GenerateTextWithHistory(ctx context.Context, history []Message) (string, error)
}
