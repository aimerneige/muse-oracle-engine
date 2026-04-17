package image

import "context"

// Provider defines the interface for image generation backends.
type Provider interface {
	// GenerateImage generates an image from a text prompt and returns the raw image bytes.
	GenerateImage(ctx context.Context, prompt string) ([]byte, error)

	// Name returns a human-readable name for this provider, useful for logging.
	Name() string
}
