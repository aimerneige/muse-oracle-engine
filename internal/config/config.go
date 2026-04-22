package config

import (
	"fmt"
	"os"
)

// Config holds the application configuration.
type Config struct {
	// API Keys
	GeminiAPIKey   string `json:"gemini_api_key"`
	DeepSeekAPIKey string `json:"deepseek_api_key"`
	OpenAIAPIKey   string `json:"openai_api_key"`

	// Model selection
	LLMProvider   string `json:"llm_provider"`   // "gemini", "deepseek", "mock"
	LLMModel      string `json:"llm_model"`      // model identifier
	ImageProvider    string `json:"image_provider"`     // "gemini", "openai", "mock"
	ImageModel       string `json:"image_model"`        // model identifier

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

		LLMProvider:   getEnvDefault("LLM_PROVIDER", "gemini"),
		LLMModel:      getEnvDefault("LLM_MODEL", "gemini-3.1-pro-preview"),
		ImageProvider: getEnvDefault("IMAGE_PROVIDER", "gemini"),
		ImageModel:    getEnvDefault("IMAGE_MODEL", "gemini-3.1-flash-image-preview"),

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

	case "mock":
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

	case "prompt", "mock":
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
