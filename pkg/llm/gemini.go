package llm

import (
	"context"

	"google.golang.org/genai"
)

type GeminiModel int

const (
	Gemini3Pro GeminiModel = iota
	Gemini3Flash
	Gemini3FlashLite
	Gemini2Pro
	Gemini2Flash
	Gemini2FlashLite
)

func (m GeminiModel) String() string {
	switch m {
	case Gemini3Pro:
		return "gemini-3.1-pro-preview"
	case Gemini3Flash:
		return "gemini-3-flash-preview"
	case Gemini3FlashLite:
		return "gemini-3.1-flash-lite-preview"
	case Gemini2Pro:
		return "gemini-2.5-pro"
	case Gemini2Flash:
		return "gemini-2.5-flash"
	case Gemini2FlashLite:
		return "gemini-2.5-flash-lite"
	default:
		return ""
	}
}

type GeminiAdapter struct {
	client *genai.Client
	model  GeminiModel
}

func NewGeminiAdapter(apiKey string, model GeminiModel) (*GeminiAdapter, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, err
	}
	return &GeminiAdapter{
		client: client,
		model:  model,
	}, nil
}

func (g *GeminiAdapter) GenerateText(ctx context.Context, prompt string) (string, error) {
	result, err := g.client.Models.GenerateContent(
		ctx,
		g.model.String(),
		genai.Text(prompt),
		nil,
	)
	return result.Text(), err
}
