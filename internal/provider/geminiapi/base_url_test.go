package geminiapi

import "testing"

func TestNormalizeBaseURLRemovesVersionPath(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"https://api.302.ai/v1":       "https://api.302.ai",
		"https://api.302.ai/v1/":      "https://api.302.ai",
		"https://api.302.ai/v1beta":   "https://api.302.ai",
		"https://api.302.ai/v1alpha/": "https://api.302.ai",
		"https://api.302.ai":          "https://api.302.ai",
		" https://api.302.ai/v1 ":     "https://api.302.ai",
	}

	for input, want := range tests {
		got := NormalizeBaseURL(input)
		if got != want {
			t.Fatalf("NormalizeBaseURL(%q) = %q, want %q", input, got, want)
		}
	}
}
