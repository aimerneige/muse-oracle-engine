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

	geminiApiKey := os.Getenv("GEMINI_API_KEY")
	deepseekApiKey := os.Getenv("DEEPSEEK_API_KEY")

	ctx := context.Background()

	prompt := "Explain how AI works in a few words"

	var llmProvider llm.LLMProvider
	var err error
	llmProvider, err = llm.NewGeminiAdapter(geminiApiKey, llm.Gemini2FlashLite)
	if err != nil {
		log.Fatal(err)
	}
	result, err := llmProvider.GenerateText(ctx, prompt)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Gemini Generated Text:", result)

	llmProvider = llm.NewDeepSeekAdapter(deepseekApiKey, llm.DeepSeekChat)
	result, err = llmProvider.GenerateText(ctx, prompt)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Deepseek Generated Text:", result)
}
