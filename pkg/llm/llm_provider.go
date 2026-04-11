package llm

import (
	"context"
)

type LLMProvider interface {
	GenerateText(ctx context.Context, prompt string) (string, error)
}
