package image

import (
	"context"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

// OpenAIImageModel enumerates supported OpenAI image generation models.
type OpenAIImageModel int

const (
	// DALLE3 uses DALL·E 3 for image generation.
	DALLE3 OpenAIImageModel = iota
	// DALLE2 uses DALL·E 2 for image generation.
	DALLE2
)

func (m OpenAIImageModel) String() string {
	switch m {
	case DALLE3:
		return "dall-e-3"
	case DALLE2:
		return "dall-e-2"
	default:
		return ""
	}
}

// OpenAIImageAdapter implements Provider using the OpenAI Images API (DALL·E).
type OpenAIImageAdapter struct {
	client *openai.Client
	model  OpenAIImageModel
}

// NewOpenAIImageAdapter creates a new OpenAI image generation provider.
func NewOpenAIImageAdapter(apiKey string, model OpenAIImageModel) *OpenAIImageAdapter {
	client := openai.NewClient(
		option.WithAPIKey(apiKey),
	)
	return &OpenAIImageAdapter{
		client: &client,
		model:  model,
	}
}

func (o *OpenAIImageAdapter) Name() string {
	return fmt.Sprintf("openai-image/%s", o.model.String())
}

func (o *OpenAIImageAdapter) GenerateImage(ctx context.Context, prompt string) ([]byte, error) {
	resp, err := o.client.Images.Generate(ctx, openai.ImageGenerateParams{
		Model:          openai.ImageModel(o.model.String()),
		Prompt:         prompt,
		ResponseFormat: openai.ImageGenerateParamsResponseFormatB64JSON,
		Size:           openai.ImageGenerateParamsSize1024x1024,
	})
	if err != nil {
		return nil, fmt.Errorf("openai image generation failed: %w", err)
	}

	if len(resp.Data) == 0 {
		return nil, fmt.Errorf("no image data in response")
	}

	data := resp.Data[0].B64JSON
	if data == "" {
		return nil, fmt.Errorf("empty base64 data in response")
	}

	return []byte(data), nil
}
