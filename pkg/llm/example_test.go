package llm_test

import (
	"context"
	"fmt"
	"log"

	"github.com/aimerneige/lovelive-manga-generator/pkg/llm"
)

func ExampleClient_Chat_gemini() {
	// Initialize the configuration with your API Keys
	cfg := llm.Config{
		GeminiAPIKey: "YOUR_GEMINI_API_KEY",
	}

	// Create a new encapsulated client
	client := llm.NewClient(cfg)

	// Create a chat request
	req := llm.Request{
		Model: llm.ModelGemini31Pro,
		Messages: []llm.Message{
			{Role: "user", Content: "Hello, world!"},
		},
	}

	// Send the request
	resp, err := client.Chat(context.Background(), req)
	if err != nil {
		log.Fatalf("Error calling LLM: %v", err)
	}

	fmt.Println("Response:", resp.Content)
}

func ExampleClient_Chat_nanoBanana() {
	// Initialize the configuration with your API Keys
	cfg := llm.Config{
		NanoBananaAPIKey:  "YOUR_NANO_BANANA_API_KEY",
		NanoBananaBaseURL: "https://api.nanobanana.ai/v1/chat/completions",
	}

	// Create a new encapsulated client
	client := llm.NewClient(cfg)

	// Create a chat request
	req := llm.Request{
		Model: llm.ModelNanoBanana2,
		Messages: []llm.Message{
			{Role: "user", Content: "Who are you?"},
		},
	}

	// Send the request
	resp, err := client.Chat(context.Background(), req)
	if err != nil {
		log.Fatalf("Error calling LLM: %v", err)
	}

	fmt.Println("Response:", resp.Content)
}
