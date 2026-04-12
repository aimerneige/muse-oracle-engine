package img

import (
	"context"
	"errors"

	"google.golang.org/genai"
)

type NanoBananaModel int

const (
	NanoBanana2 NanoBananaModel = iota
	NanoBananaPro
	NanoBanana
)

func (m NanoBananaModel) String() string {
	switch m {
	case NanoBanana2:
		return "gemini-3.1-flash-image-preview"
	case NanoBananaPro:
		return "gemini-3-pro-image-preview"
	case NanoBanana:
		return "gemini-2.5-flash-image"
	default:
		return ""
	}
}

type NanobananaAdapter struct {
	client *genai.Client
	model  NanoBananaModel
}

func NewNanobananaAdapter(apiKey string, model NanoBananaModel) (*NanobananaAdapter, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, err
	}
	return &NanobananaAdapter{
		client: client,
		model:  model,
	}, nil
}

func (n *NanobananaAdapter) GenerateImage(ctx context.Context, prompt string) ([]byte, error) {
	result, err := n.client.Models.GenerateContent(
		ctx,
		n.model.String(),
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
