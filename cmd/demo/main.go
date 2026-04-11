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

	gemini, err := llm.NewGeminiAdapter(geminiApiKey, llm.Gemini2FlashLite)
	if err != nil {
		log.Fatal(err)
	}
	result, err := gemini.GenerateText(ctx, prompt)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Gemini Generated Text:", result)

	deepseek := llm.NewDeepSeekAdapter(deepseekApiKey, llm.DeepSeekChat)
	result, err = deepseek.GenerateText(ctx, prompt)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Deepseek Generated Text:", result)

	history := []llm.Message{
		{Role: llm.RoleUser, Content: "Hi"},
		{Role: llm.RoleAssistant, Content: "Hello!"},
		{Role: llm.RoleUser, Content: "How are you?"},
	}

	result, err = gemini.GenerateTextWithHistory(ctx, history)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Gemini With History:", result)

	result, err = deepseek.GenerateTextWithHistory(ctx, history)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Deepseek With History:", result)
}
