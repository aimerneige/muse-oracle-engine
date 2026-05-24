package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

// Config holds the application configuration.
type Config struct {
	// API Keys
	GeminiAPIKey   string `json:"gemini_api_key"`
	DeepSeekAPIKey string `json:"deepseek_api_key"`
	OpenAIAPIKey   string `json:"openai_api_key"`

	// Model selection
	LLMProvider                string `json:"llm_provider"`                  // "gemini", "deepseek", "gemini-bridge", "mock"
	LLMModel                   string `json:"llm_model"`                     // model identifier
	ImageProvider              string `json:"image_provider"`                // "gemini", "gemini-bridge", "openai", "gpt-image", "mock"
	GPTImageEndpoint           string `json:"gpt_image_endpoint"`            // custom endpoint for GPT-Image
	GeminiBridgeEndpoint       string `json:"gemini_bridge_endpoint"`        // local gemini_bridge server endpoint
	GeminiBridgeModel          string `json:"gemini_bridge_model"`           // "fast", "thinking", or "pro"
	GeminiBridgeTimeoutSeconds int    `json:"gemini_bridge_timeout_seconds"` // max wait time per bridge task
	ImageModel                 string `json:"image_model"`                   // model identifier
	GeminiImageSize            string `json:"gemini_image_size"`             // "1K", "2K", or "4K"

	// Mock mode: when true, LLM and image providers return fake data for frontend testing
	MockMode bool `json:"mock_mode"`

	// Paths
	DataDir   string `json:"data_dir"`   // root directory for project data
	CharDBDir string `json:"chardb_dir"` // root directory for character data
	StylesDir string `json:"styles_dir"` // root directory for custom styles

	// Server
	ServerAddr string `json:"server_addr"` // HTTP server listen address
}

// LoadFromEnv loads configuration from environment variables.
func LoadFromEnv() *Config {
	mockMode := false
	if v := os.Getenv("MOCK_MODE"); v != "" {
		mockMode = true
	}

	cfg := &Config{
		GeminiAPIKey:   os.Getenv("GEMINI_API_KEY"),
		DeepSeekAPIKey: os.Getenv("DEEPSEEK_API_KEY"),
		OpenAIAPIKey:   os.Getenv("OPENAI_API_KEY"),

		LLMProvider:                getEnvDefault("LLM_PROVIDER", "gemini"),
		LLMModel:                   getEnvDefault("LLM_MODEL", "gemini-3.1-pro-preview"),
		ImageProvider:              getEnvDefault("IMAGE_PROVIDER", "gemini"),
		ImageModel:                 getEnvDefault("IMAGE_MODEL", "gemini-3.1-flash-image-preview"),
		GeminiImageSize:            normalizeGeminiImageSize(os.Getenv("GEMINI_IMAGE_SIZE")),
		GPTImageEndpoint:           getEnvDefault("GPT_IMAGE_ENDPOINT", ""),
		GeminiBridgeEndpoint:       getEnvDefault("GEMINI_BRIDGE_ENDPOINT", "http://127.0.0.1:8765"),
		GeminiBridgeModel:          getEnvDefault("GEMINI_BRIDGE_MODEL", "pro"),
		GeminiBridgeTimeoutSeconds: getEnvIntDefault("GEMINI_BRIDGE_TIMEOUT_SECONDS", 600),

		MockMode: mockMode,

		DataDir:   getEnvDefault("DATA_DIR", "data/projects"),
		CharDBDir: getEnvDefault("CHARDB_DIR", ""),
		StylesDir: getEnvDefault("STYLES_DIR", ""),

		ServerAddr: getEnvDefault("SERVER_ADDR", ":8080"),
	}

	// In mock mode, override providers to mock
	if cfg.MockMode {
		cfg.LLMProvider = "mock"
		cfg.ImageProvider = "mock"
	}
	return cfg
}

// Validate checks for required configuration values.
func (c *Config) Validate() error {
	// Mock mode skips all API key validation
	if c.MockMode {
		return nil
	}

	switch c.LLMProvider {
	case "gemini":
		if c.GeminiAPIKey == "" {
			return fmt.Errorf("GEMINI_API_KEY is required when LLM_PROVIDER is 'gemini'")
		}
	case "deepseek":
		if c.DeepSeekAPIKey == "" {
			return fmt.Errorf("DEEPSEEK_API_KEY is required when LLM_PROVIDER is 'deepseek'")
		}

	case "gemini-bridge", "mock":
		// mock mode: no API key needed
	default:
		return fmt.Errorf("unknown LLM_PROVIDER: %s", c.LLMProvider)
	}

	switch c.ImageProvider {
	case "gemini":
		if c.GeminiAPIKey == "" {
			return fmt.Errorf("GEMINI_API_KEY is required when IMAGE_PROVIDER is 'gemini'")
		}
	case "openai":
		if c.OpenAIAPIKey == "" {
			return fmt.Errorf("OPENAI_API_KEY is required when IMAGE_PROVIDER is 'openai'")
		}
	case "gpt-image":
		if c.OpenAIAPIKey == "" {
			return fmt.Errorf("OPENAI_API_KEY is required when IMAGE_PROVIDER is 'gpt-image'")
		}

	case "gemini-bridge", "prompt", "mock":
		// prompt/mock mode: no API key needed for image generation
	default:
		return fmt.Errorf("unknown IMAGE_PROVIDER: %s", c.ImageProvider)
	}

	return nil
}

func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func normalizeGeminiImageSize(value string) string {
	size := strings.TrimSpace(value)
	if size == "" {
		return "1K"
	}

	switch size {
	case "1K", "2K", "4K":
		return size
	default:
		log.Printf("Warning: invalid GEMINI_IMAGE_SIZE %q, falling back to 1K", value)
		return "1K"
	}
}

func getEnvIntDefault(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return fallback
}
