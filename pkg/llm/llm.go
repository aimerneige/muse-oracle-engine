package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	// Model names
	ModelGemini31Pro   = "gemini-3.1-pro-preview"
	ModelNanoBanana    = "gemini-2.5-flash-image"
	ModelNanoBanana2   = "gemini-3.1-flash-image-preview"
	ModelNanoBananaPro = "gemini-3-pro-image-preview"
)

// Message represents a standard chat message.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Request defines the input for a chat completion.
type Request struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float32   `json:"temperature,omitempty"`
}

// Response defines the output of a chat completion.
type Response struct {
	Content string
}

// Client is the interface for interacting with various LLMs.
type Client interface {
	Chat(ctx context.Context, req Request) (*Response, error)
}

// Config configures the common settings for the providers.
type Config struct {
	GeminiAPIKey      string
	NanoBananaAPIKey  string
	NanoBananaBaseURL string // E.g., for custom hosted open-source models
}

type clientImpl struct {
	cfg        Config
	httpClient *http.Client
}

// NewClient initializes the LLM client wrapper capable of calling multiple providers.
func NewClient(cfg Config) Client {
	return &clientImpl{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// Chat directs the request to the target model's implementation.
func (c *clientImpl) Chat(ctx context.Context, req Request) (*Response, error) {
	if len(req.Messages) == 0 {
		return nil, fmt.Errorf("messages cannot be empty")
	}

	switch req.Model {
	case ModelGemini31Pro:
		return c.callGemini(ctx, req)
	case ModelNanoBanana2:
		return c.callNanoBanana(ctx, req)
	default:
		return nil, fmt.Errorf("unsupported model: %s. Supported: %s, %s", req.Model, ModelGemini31Pro, ModelNanoBanana2)
	}
}

// callGemini implements the call to Google Gemini 3.1 Pro.
func (c *clientImpl) callGemini(ctx context.Context, req Request) (*Response, error) {
	if c.cfg.GeminiAPIKey == "" {
		return nil, fmt.Errorf("gemini api key is missing")
	}

	// Assuming Google's standard v1beta endpoints format for Gemini
	// Structure:
	// { "contents": [{ "role": "user", "parts": [{ "text": "..." }] }] }
	type Part struct {
		Text string `json:"text"`
	}
	type Content struct {
		Role  string `json:"role"`
		Parts []Part `json:"parts"`
	}
	type GeminiRequest struct {
		Contents []Content `json:"contents"`
	}

	var geminiReq GeminiRequest
	for _, m := range req.Messages {
		role := m.Role
		if role == "assistant" {
			role = "model" // Gemini uses 'model' instead of 'assistant'
		}
		geminiReq.Contents = append(geminiReq.Contents, Content{
			Role: role,
			Parts: []Part{
				{Text: m.Content},
			},
		})
	}

	reqBody, err := json.Marshal(geminiReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal gemini request: %w", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", req.Model, c.cfg.GeminiAPIKey)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("gemini api request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gemini returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// Parse Gemini Response
	type GeminiResponse struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	var gResp GeminiResponse
	if err := json.Unmarshal(bodyBytes, &gResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal gemini response: %w", err)
	}

	if len(gResp.Candidates) == 0 || len(gResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("gemini returned an empty response")
	}

	return &Response{
		Content: gResp.Candidates[0].Content.Parts[0].Text,
	}, nil
}

// callNanoBanana implements the call to Nano Banana 2.
// Assuming it heavily follows the standard OpenAI-compatible completions API structure.
func (c *clientImpl) callNanoBanana(ctx context.Context, req Request) (*Response, error) {
	baseURL := c.cfg.NanoBananaBaseURL
	if baseURL == "" {
		baseURL = "https://api.nanobanana.ai/v1/chat/completions" // Dummy default endpoint
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal nano banana request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", baseURL, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.cfg.NanoBananaAPIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.cfg.NanoBananaAPIKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("nano banana api request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("nano banana returned status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	// Parse standard OpenAI response struct
	type OpenAIResponse struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	var oResp OpenAIResponse
	if err := json.Unmarshal(bodyBytes, &oResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal nano banana response: %w", err)
	}

	if len(oResp.Choices) == 0 {
		return nil, fmt.Errorf("nano banana returned an empty response")
	}

	return &Response{
		Content: oResp.Choices[0].Message.Content,
	}, nil
}
