package image

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/aimerneige/muse-oracle-engine/internal/config"
)

// GPTImageModel enumerates supported GPT-Image models via proxy.
type GPTImageModel int

const (
	// GPT2Plus is the latest GPT-Image-2-Plus model (default).
	GPT2Plus GPTImageModel = iota
	// GPT2 is the GPT-Image-2 model.
	GPT2
	// GPT1 is the original GPT-Image model.
	GPT1
	// GPT1Mini is the lightweight GPT-Image-1-Mini model.
	GPT1Mini
	// GPT15 is the GPT-Image-1.5 model.
	GPT15
)

func (m GPTImageModel) String() string {
	switch m {
	case GPT2Plus:
		return "gpt-image-2-plus"
	case GPT2:
		return "gpt-image-2"
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

// ParseGPTImageModel converts a model string to its enum value.
func ParseGPTImageModel(s string) GPTImageModel {
	switch s {
	case "gpt-image-2-plus", "":
		return GPT2Plus
	case "gpt-image-2":
		return GPT2
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

// defaultGPTEndpoint is the default proxy images/generations endpoint.
const defaultGPTEndpoint = "https://api.302.ai/v1/images/generations"

// gptGenerateRequest is the JSON request body for the GPT-Image API.
type gptGenerateRequest struct {
	Model        string `json:"model"`
	Prompt       string `json:"prompt"`
	Size         string `json:"size"`
	Background   string `json:"background"`
	Moderation   string `json:"moderation"`
	N            int    `json:"n"`
	Quality      string `json:"quality"`
	OutputFormat string `json:"output_format"`
}

// gptGenerateResponse represents the API response structure.
type gptGenerateResponse struct {
	Data []struct {
		B64JSON string `json:"b64_json"` // base64-encoded image data
		URL     string `json:"url"`      // optional URL fallback
	} `json:"data"`
}

// GPTImageAdapter implements Provider using the GPT-Image API.
type GPTImageAdapter struct {
	endpoint   string
	apiKey     string
	model      GPTImageModel
	httpClient *http.Client
}

// NewGPTImageAdapter creates a new GPT image generation provider.
// If cfg.GPTImageEndpoint is empty, it defaults to a proxy service.
func NewGPTImageAdapter(cfg *config.Config) *GPTImageAdapter {
	endpoint := cfg.GPTImageEndpoint
	if endpoint == "" {
		endpoint = defaultGPTEndpoint
	}
	return &GPTImageAdapter{
		endpoint:   endpoint,
		apiKey:     cfg.OpenAIAPIKey,
		model:      ParseGPTImageModel(cfg.ImageModel),
		httpClient: &http.Client{},
	}
}

func (g *GPTImageAdapter) Name() string {
	return fmt.Sprintf("gpt-image/%s", g.model.String())
}

func (g *GPTImageAdapter) GenerateImage(ctx context.Context, prompt string) ([]byte, error) {
	reqBody := gptGenerateRequest{
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
		return nil, fmt.Errorf("gpt-image: failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.endpoint, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("gpt-image: failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", g.apiKey))

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gpt-image: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("gpt-image: failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gpt-image: API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var apiResp gptGenerateResponse
	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("gpt-image: failed to parse response: %w", err)
	}

	if len(apiResp.Data) == 0 {
		return nil, fmt.Errorf("gpt-image: no image data in response")
	}

	b64Data := apiResp.Data[0].B64JSON
	if b64Data != "" {
		if idx := strings.Index(b64Data, "base64,"); idx != -1 {
			b64Data = b64Data[idx+7:]
		}

		decoded, err := base64.StdEncoding.DecodeString(b64Data)
		if err != nil {
			return nil, fmt.Errorf("gpt-image: failed to decode base64 image data: %w", err)
		}
		return decoded, nil
	}

	imageURL := apiResp.Data[0].URL
	if imageURL != "" {
		imgReq, err := http.NewRequestWithContext(ctx, http.MethodGet, imageURL, nil)
		if err != nil {
			return nil, fmt.Errorf("gpt-image: failed to create image request: %w", err)
		}

		imgResp, err := g.httpClient.Do(imgReq)
		if err != nil {
			return nil, fmt.Errorf("gpt-image: failed to fetch image from url: %w", err)
		}
		defer imgResp.Body.Close()

		if imgResp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("gpt-image: failed to fetch image, status %d", imgResp.StatusCode)
		}

		return io.ReadAll(imgResp.Body)
	}

	return nil, fmt.Errorf("gpt-image: no image data or url in response")
}
