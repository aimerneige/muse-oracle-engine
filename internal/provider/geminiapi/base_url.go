package geminiapi

import "strings"

// NormalizeBaseURL keeps custom Gemini API hosts compatible with the SDK,
// which appends its own API version path.
func NormalizeBaseURL(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	for _, suffix := range []string{"/v1beta", "/v1alpha", "/v1"} {
		if strings.HasSuffix(trimmed, suffix) {
			return strings.TrimSuffix(trimmed, suffix)
		}
	}
	return trimmed
}
