package storage

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestSaveLongMangaErrorContextWritesTimestampedUniqueFile(t *testing.T) {
	t.Parallel()

	store, err := NewLongMangaStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewLongMangaStore returned error: %v", err)
	}

	relPath, err := store.SaveLongMangaErrorContext("project-1", "long_episode_001_prompt", "AI input", "AI output", assertError("bad response"))
	if err != nil {
		t.Fatalf("SaveLongMangaErrorContext returned error: %v", err)
	}

	pattern := regexp.MustCompile(`^ai_errors/long_episode_001_prompt_\d{8}T\d{6}\.\d{9}Z_[0-9a-f]{8}\.md$`)
	if !pattern.MatchString(relPath) {
		t.Fatalf("expected timestamped diagnostic path, got %s", relPath)
	}

	data, err := os.ReadFile(filepath.Join(store.projectDir("project-1"), relPath))
	if err != nil {
		t.Fatalf("failed to read diagnostic file: %v", err)
	}
	content := string(data)
	for _, want := range []string{"AI input", "AI output", "bad response"} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected diagnostic file to contain %q, got %s", want, content)
		}
	}
}

type assertError string

func (e assertError) Error() string {
	return string(e)
}
