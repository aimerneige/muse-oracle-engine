package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAICompatAdapterGenerateTextWithHistory(t *testing.T) {
	type chatRequest struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("expected /v1/chat/completions, got %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("expected bearer auth header, got %s", r.Header.Get("Authorization"))
		}

		var request chatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatalf("failed to decode request: %v", err)
		}
		if request.Model != "gpt-5.5" {
			t.Fatalf("expected model gpt-5.5, got %s", request.Model)
		}
		if len(request.Messages) != 3 {
			t.Fatalf("expected 3 messages, got %d", len(request.Messages))
		}
		if request.Messages[0].Role != "system" || request.Messages[1].Role != "user" || request.Messages[2].Role != "assistant" {
			t.Fatalf("unexpected message roles: %+v", request.Messages)
		}

		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(`{"id":"chatcmpl-test","object":"chat.completion","created":1,"model":"gpt-5.5","choices":[{"index":0,"message":{"role":"assistant","content":"pong"},"finish_reason":"stop"}]}`)); err != nil {
			t.Fatalf("failed to write response: %v", err)
		}
	}))
	defer server.Close()

	adapter := NewOpenAICompatAdapter("openai", server.URL+"/v1/", "test-key", "gpt-5.5")

	got, err := adapter.GenerateTextWithHistory(context.Background(), History{
		{Role: RoleSystem, Content: "You are concise."},
		{Role: RoleUser, Content: "ping"},
		{Role: RoleAssistant, Content: "thinking"},
	})
	if err != nil {
		t.Fatalf("GenerateTextWithHistory returned error: %v", err)
	}
	if got != "pong" {
		t.Fatalf("expected pong, got %s", got)
	}
}
