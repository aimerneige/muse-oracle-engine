package image

import (
	"context"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"bytes"
)

// MockProvider is an image provider that generates a simple placeholder PNG
// for testing the frontend flow without calling any image generation API.
type MockProvider struct{}

// NewMockProvider creates a new mock image provider.
func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

// GenerateImage generates a placeholder PNG image with panel index and text overlay.
func (m *MockProvider) GenerateImage(_ context.Context, prompt string) ([]byte, error) {
	// Create a 512x512 placeholder image
	width, height := 512, 512
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// Draw gradient background (light purple to soft pink)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			r := float64(x) / float64(width)
			g := float64(y) / float64(height)
			c := color.RGBA{
				R: uint8(180 + 50*r),
				G: uint8(150 + 50*(1-g)),
				B: uint8(220 + 20*g),
				A: 255,
			}
			img.Set(x, y, c)
		}
	}

	// Draw a border rectangle
	borderColor := color.RGBA{R: 100, G: 80, B: 160, A: 255}
	draw.Draw(img, image.Rect(10, 10, width-10, 11), &image.Uniform{borderColor}, image.Point{}, draw.Src)
	draw.Draw(img, image.Rect(10, height-11, width-10, height), &image.Uniform{borderColor}, image.Point{}, draw.Src)
	draw.Draw(img, image.Rect(10, 10, 11, height-10), &image.Uniform{borderColor}, image.Point{}, draw.Src)
	draw.Draw(img, image.Rect(width-11, 10, width, height-10), &image.Uniform{borderColor}, image.Point{}, draw.Src)

	// Encode to PNG
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("failed to encode mock image: %w", err)
	}

	_ = prompt // prompt is unused but kept for interface compatibility
	return buf.Bytes(), nil
}

// Name returns the provider name.
func (m *MockProvider) Name() string {
	return "mock (test mode)"
}
