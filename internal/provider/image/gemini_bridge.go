package image

import (
	"context"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/aimerneige/muse-oracle-engine/internal/provider/geminibridge"
)

// GeminiBridgeAdapter implements Provider using a local gemini_bridge server.
type GeminiBridgeAdapter struct {
	client *geminibridge.Client
	model  string
	mu     sync.Mutex
}

// NewGeminiBridgeAdapter creates a new Gemini Bridge image provider.
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

func (g *GeminiBridgeAdapter) GenerateImage(ctx context.Context, prompt string) ([]byte, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	task, err := g.client.RunTask(ctx, prompt, "image")
	if err != nil {
		return nil, err
	}
	if len(task.ResultImages) == 0 {
		return nil, fmt.Errorf("gemini-bridge: task %s returned no images", task.ID)
	}

	imagePath := task.ResultImages[0].Path
	if imagePath == "" {
		if task.ResultImages[0].Error != "" {
			return nil, fmt.Errorf("gemini-bridge: task %s image failed: %s", task.ID, task.ResultImages[0].Error)
		}
		return nil, fmt.Errorf("gemini-bridge: task %s image response missing path", task.ID)
	}

	data, err := os.ReadFile(imagePath)
	if err != nil {
		return nil, fmt.Errorf("gemini-bridge: failed to read image %s: %w", imagePath, err)
	}
	return data, nil
}
