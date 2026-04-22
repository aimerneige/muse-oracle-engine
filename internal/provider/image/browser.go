package image

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	browseragent "github.com/aimerneige/muse-oracle-engine/internal/browser"
)

// BrowserProvider implements image.Provider by delegating image generation
// to a browser agent via the task queue. It enqueues prompts and polls until
// the browser agent completes the task and uploads the resulting image.
type BrowserProvider struct {
	queue   *browseragent.Queue
	dataDir string
}

// NewBrowserProvider creates a new browser agent-backed image provider.
func NewBrowserProvider(queue *browseragent.Queue, dataDir string) *BrowserProvider {
	return &BrowserProvider{queue: queue, dataDir: dataDir}
}

// GenerateImage enqueues a prompt and blocks until the browser agent completes
// the task, returning the generated image bytes.
func (p *BrowserProvider) GenerateImage(_ context.Context, prompt string) ([]byte, error) {
	task, err := p.queue.Enqueue(prompt)
	if err != nil {
		return nil, fmt.Errorf("failed to enqueue task: %w", err)
	}
	log.Printf("[BrowserProvider] Task enqueued: id=%s", task.ID)

	// Poll for completion
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	timeout := time.After(10 * time.Minute)

	for {
		select {
		case <-timeout:
			return nil, fmt.Errorf("timeout waiting for browser agent to complete task %s", task.ID)
		case <-ticker.C:
			current, err := p.queue.Get(task.ID)
			if err != nil {
				return nil, fmt.Errorf("failed to get task status: %w", err)
			}

			switch current.Status {
			case browseragent.TaskCompleted:
				if current.FilePath == "" {
					return nil, fmt.Errorf("task %s completed but no file path", task.ID)
				}
				imgPath := filepath.Join(p.dataDir, current.FilePath)
				data, err := os.ReadFile(imgPath)
				if err != nil {
					return nil, fmt.Errorf("failed to read image at %s: %w", imgPath, err)
				}
				log.Printf("[BrowserProvider] Task completed: id=%s path=%s size=%d", task.ID, current.FilePath, len(data))
				return data, nil

			case browseragent.TaskFailed:
				return nil, fmt.Errorf("browser agent task failed: %s", current.Error)

			case browseragent.TaskPending, browseragent.TaskRunning:
				// Keep waiting
				log.Printf("[BrowserProvider] Waiting... task=%s status=%s", task.ID, current.Status)
			}
		}
	}
}

// Name returns the provider name.
func (p *BrowserProvider) Name() string {
	return "browser-agent"
}
