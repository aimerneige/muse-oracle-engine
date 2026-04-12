package image

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/genai"
)

// GeminiImageModel enumerates supported Gemini image generation models.
type GeminiImageModel int

const (
	GeminiImage31Flash GeminiImageModel = iota
	GeminiImage3Pro
	GeminiImage25Flash
)

func (m GeminiImageModel) String() string {
	switch m {
	case GeminiImage31Flash:
		return "gemini-3.1-flash-image-preview"
	case GeminiImage3Pro:
		return "gemini-3-pro-image-preview"
	case GeminiImage25Flash:
		return "gemini-2.5-flash-image"
	default:
		return ""
	}
}

// GeminiImageAdapter implements Provider using the Gemini image generation API.
type GeminiImageAdapter struct {
	client *genai.Client
	model  GeminiImageModel
}

// NewGeminiImageAdapter creates a new Gemini image generation provider.
func NewGeminiImageAdapter(apiKey string, model GeminiImageModel) (*GeminiImageAdapter, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, err
	}
	return &GeminiImageAdapter{
		client: client,
		model:  model,
	}, nil
}

func (g *GeminiImageAdapter) Name() string {
	return fmt.Sprintf("gemini-image/%s", g.model.String())
}

func (g *GeminiImageAdapter) GenerateImage(ctx context.Context, prompt string) ([]byte, error) {
	result, err := g.client.Models.GenerateContent(
		ctx,
		g.model.String(),
		genai.Text(prompt),
		nil,
	)
	if err != nil {
		return nil, err
	}

	if len(result.Candidates) == 0 || result.Candidates[0] == nil || result.Candidates[0].Content == nil {
		return nil, errors.New("no candidates in response")
	}

	for _, part := range result.Candidates[0].Content.Parts {
		if part.InlineData != nil {
			return part.InlineData.Data, nil
		}
	}

	return nil, errors.New("no image data in response")
}
