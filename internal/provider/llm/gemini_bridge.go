package llm

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aimerneige/muse-oracle-engine/internal/provider/geminibridge"
)

// GeminiBridgeAdapter implements Provider using a local gemini_bridge server.
type GeminiBridgeAdapter struct {
	client *geminibridge.Client
	model  string
}

// NewGeminiBridgeAdapter creates a new Gemini Bridge LLM provider.
func NewGeminiBridgeAdapter(endpoint string, model string, timeout time.Duration) *GeminiBridgeAdapter {
	return &GeminiBridgeAdapter{
		client: geminibridge.NewClient(endpoint, model, timeout),
		model:  model,
	}
}

func (g *GeminiBridgeAdapter) Name() string {
	if g.model == "" {
		return "gemini-bridge/default"
	}
	return "gemini-bridge/" + g.model
}

func (g *GeminiBridgeAdapter) GenerateText(ctx context.Context, prompt string) (string, error) {
	task, err := g.client.RunTask(ctx, prompt, "llm")
	if err != nil {
		return "", err
	}
	return task.ResultText, nil
}

func (g *GeminiBridgeAdapter) GenerateTextWithHistory(ctx context.Context, history History) (string, error) {
	return g.GenerateText(ctx, renderHistoryPrompt(history))
}

func renderHistoryPrompt(history History) string {
	var builder strings.Builder
	for i, msg := range history {
		if i > 0 {
			builder.WriteString("\n\n")
		}
		builder.WriteString(fmt.Sprintf("%s:\n%s", msg.Role, msg.Content))
	}
	return builder.String()
}
