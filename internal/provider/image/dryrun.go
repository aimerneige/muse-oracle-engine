package image

import (
	"context"
	"fmt"
	"os"
)

// DryRunProvider is an image provider that outputs the prompt text
// instead of calling any image generation API.
type DryRunProvider struct{}

// NewDryRunProvider creates a new dry-run image provider.
func NewDryRunProvider() *DryRunProvider {
	return &DryRunProvider{}
}

// GenerateImage outputs the prompt to stdout and returns empty bytes.
func (d *DryRunProvider) GenerateImage(_ context.Context, prompt string) ([]byte, error) {
	fmt.Fprintln(os.Stdout, "--- [PROMPT-ONLY MODE] Image generation prompt ---")
	fmt.Fprintln(os.Stdout, prompt)
	fmt.Fprintln(os.Stdout, "--- [PROMPT-ONLY MODE] End of prompt ---")
	fmt.Fprintln(os.Stdout)
	return nil, nil
}

// Name returns the provider name.
func (d *DryRunProvider) Name() string {
	return "prompt-only (dry-run)"
}
