package llm

import "context"

// MessageRole represents the role of a message in an LLM conversation.
type MessageRole string

const (
	RoleUser      MessageRole = "user"
	RoleAssistant MessageRole = "assistant"
	RoleSystem    MessageRole = "system"
)

// Message represents a single message in a conversation history.
type Message struct {
	Role    MessageRole `json:"role"`
	Content string      `json:"content"`
}

// History is an ordered list of conversation messages.
type History []Message

// Provider defines the interface for LLM text generation backends.
type Provider interface {
	// GenerateText sends a single prompt and returns the generated text.
	GenerateText(ctx context.Context, prompt string) (string, error)

	// GenerateTextWithHistory sends a multi-turn conversation and returns the generated text.
	GenerateTextWithHistory(ctx context.Context, history History) (string, error)

	// Name returns a human-readable name for this provider, useful for logging.
	Name() string
}
