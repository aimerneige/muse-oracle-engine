package image

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/aimerneige/muse-oracle-engine/internal/config"
)

// GPT2ImageModel enumerates supported GPT-Image models via 302.ai.
type GPT2ImageModel int

const (
	// GPT2Plus is the latest GPT-Image-2-Plus model (default).
	GPT2Plus GPT2ImageModel = iota
	// GPT1 is the original GPT-Image model.
	GPT1
	// GPT1Mini is the lightweight GPT-Image-1-Mini model.
	GPT1Mini
	// GPT15 is the GPT-Image-1.5 model.
	GPT15
)

func (m GPT2ImageModel) String() string {
	switch m {
	case GPT2Plus:
		return "gpt-image-2-plus"
	case GPT1:
		return "gpt-image-1"
	case GPT1Mini:
		return "gpt-image-1-mini"
	case GPT15:
		return "gpt-image-1.5"
	default:
		return ""
	}
}

// ParseGPT2ImageModel converts a model string to its enum value.
func ParseGPT2ImageModel(s string) GPT2ImageModel {
	switch s {
	case "gpt-image-2-plus", "":
		return GPT2Plus
	case "gpt-image-1":
		return GPT1
	case "gpt-image-1-mini":
		return GPT1Mini
	case "gpt-image-1.5":
		return GPT15
	default:
		return -1
	}
}

// defaultGPT2Endpoint is the default 302.ai images/generations endpoint.
const defaultGPT2Endpoint = "https://api.302.ai/v1/images/generations"

// gpt2GenerateRequest is the JSON request body for the 302.ai GPT-Image-2 API.
type gpt2GenerateRequest struct {
	Model        string `json:"model"`
	Prompt       string `json:"prompt"`
	Size         string `json:"size"`
	Background   string `json:"background"`
	Moderation   string `json:"moderation"`
	N            int    `json:"n"`
	Quality      string `json:"quality"`
	OutputFormat string `json:"output_format"`
}

// gpt2GenerateResponse represents the API response structure.
type gpt2GenerateResponse struct {
	Data []struct {
		B64JSON string `json:"b64_json"` // base64-encoded image data
		URL     string `json:"url"`       // optional URL fallback
	} `json:"data"`
}

// GPT2ImageAdapter implements Provider using the 302.ai GPT-Image-2 API.
type GPT2ImageAdapter struct {
	endpoint string
	apiKey   string
	model    GPT2ImageModel
	httpClient *http.Client
}

// NewGPT2ImageAdapter creates a new GPT-2 image generation provider.
// If cfg.GPT2Endpoint is empty, it defaults to the 302.ai service.
func NewGPT2ImageAdapter(cfg *config.Config) *GPT2ImageAdapter {
	endpoint := cfg.GPT2Endpoint
	if endpoint == "" {
		endpoint = defaultGPT2Endpoint
	}
	return &GPT2ImageAdapter{
		endpoint:    endpoint,
		apiKey:      cfg.ThreeOTwoKey,
		model:       ParseGPT2ImageModel(cfg.ImageModel),
		httpClient:  &http.Client{},
	}
}

func (g *GPT2ImageAdapter) Name() string {
	return fmt.Sprintf("gpt2-image/%s", g.model.String())
}

func (g *GPT2ImageAdapter) GenerateImage(ctx context.Context, prompt string) ([]byte, error) {
	reqBody := gpt2GenerateRequest{
		Model:        g.model.String(),
		Prompt:       prompt,
		Size:         "auto",
		Background:   "auto",
		Moderation:   "low",
		N:            1,
		Quality:      "high",
		OutputFormat: "png",
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("gpt2: failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("gpt2: failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", g.apiKey))

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gpt2: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("gpt2: failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gpt2: API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var apiResp gpt2GenerateResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("gpt2: failed to parse response: %w", err)
	}

	if len(apiResp.Data) == 0 {
		return nil, fmt.Errorf("gpt2: no image data in response")
	}

	b64Data := apiResp.Data[0].B64JSON
	if b64Data == "" {
		return nil, fmt.Errorf("gpt2: empty base64 data in response")
	}

	return []byte(b64Data), nil
}
