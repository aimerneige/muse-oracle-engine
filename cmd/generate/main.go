package main

import (
	"context"
	"log"
	"os"

	"github.com/aimerneige/lovelive-manga-generator/pkg/llm"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Fatal("GEMINI_API_KEY is not set in .env file")
	}

	ctx := context.Background()

	var llmProvider llm.LLMProvider
	llmProvider, err := llm.NewGeminiAdapter(apiKey, llm.Gemini3Pro)
	if err != nil {
		log.Fatal(err)
	}
	prompt := "Why is the sky blue? Answer in 3 sentences."
	result, err := llmProvider.GenerateText(ctx, prompt)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Generated Text:", result)
}
