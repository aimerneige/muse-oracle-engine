package config

import (
	"io"
	"log"
	"testing"
)

func TestNormalizeGeminiImageSize(t *testing.T) {
	originalOutput := log.Writer()
	log.SetOutput(io.Discard)
	t.Cleanup(func() {
		log.SetOutput(originalOutput)
	})

	tests := []struct {
		name  string
		value string
		want  string
	}{
		{name: "empty defaults to 1K", value: "", want: "1K"},
		{name: "valid 1K", value: "1K", want: "1K"},
		{name: "valid 2K", value: "2K", want: "2K"},
		{name: "valid 4K", value: "4K", want: "4K"},
		{name: "lowercase falls back to 1K", value: "2k", want: "1K"},
		{name: "unsupported falls back to 1K", value: "8K", want: "1K"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeGeminiImageSize(tt.value); got != tt.want {
				t.Fatalf("expected %s, got %s", tt.want, got)
			}
		})
	}
}

func TestLoadFromEnvLoadsGeminiImageSize(t *testing.T) {
	t.Setenv("GEMINI_IMAGE_SIZE", "4K")

	cfg := LoadFromEnv()

	if cfg.GeminiImageSize != "4K" {
		t.Fatalf("expected 4K, got %s", cfg.GeminiImageSize)
	}
}

func TestLoadFromEnvFallsBackForInvalidGeminiImageSize(t *testing.T) {
	originalOutput := log.Writer()
	log.SetOutput(io.Discard)
	t.Cleanup(func() {
		log.SetOutput(originalOutput)
	})

	t.Setenv("GEMINI_IMAGE_SIZE", "4k")

	cfg := LoadFromEnv()

	if cfg.GeminiImageSize != "1K" {
		t.Fatalf("expected 1K, got %s", cfg.GeminiImageSize)
	}
}

func TestLoadFromEnvDefaultsGeminiImageSize(t *testing.T) {
	t.Setenv("GEMINI_IMAGE_SIZE", "")

	cfg := LoadFromEnv()

	if cfg.GeminiImageSize != "1K" {
		t.Fatalf("expected 1K, got %s", cfg.GeminiImageSize)
	}
}
