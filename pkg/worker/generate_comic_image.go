package worker

import (
	"context"
	"embed"
	"fmt"

	"github.com/aimerneige/lovelive-manga-generator/pkg/img"
)

//go:embed prompts/comic_draw/*.md
var promptsFS embed.FS

type ComicStyle string

const (
	StyleChibiFigure ComicStyle = "LoveLive_Chibi_Figure"
	StyleFigmaFigure ComicStyle = "LoveLive_Figma_Figure"
	StyleWaterColor  ComicStyle = "LoveLive_WaterColor"
)

type ComicImageGenerator struct {
	imgProvider img.ImgProvider
}

func NewComicImageGenerator(provider img.ImgProvider) *ComicImageGenerator {
	return &ComicImageGenerator{
		imgProvider: provider,
	}
}

func (g *ComicImageGenerator) Generate(ctx context.Context, style ComicStyle, character, storybook string) ([]byte, error) {
	prompt, err := g.loadPrompt(style)
	if err != nil {
		return nil, fmt.Errorf("failed to load prompt: %w", err)
	}

	fullPrompt := prompt + "\n\n" + character + "\n\n" + storybook

	return g.imgProvider.GenerateImage(ctx, fullPrompt)
}

func (g *ComicImageGenerator) loadPrompt(style ComicStyle) (string, error) {
	filename := fmt.Sprintf("prompts/comic_draw/%s.md", style)
	data, err := promptsFS.ReadFile(filename)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
