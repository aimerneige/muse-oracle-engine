package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
)

// LongMangaStore persists standalone multi-round manga generation state.
type LongMangaStore struct {
	rootDir string
}

// NewLongMangaStore creates a store rooted at the same directory as project data.
func NewLongMangaStore(rootDir string) (*LongMangaStore, error) {
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create data directory %s: %w", rootDir, err)
	}
	return &LongMangaStore{rootDir: rootDir}, nil
}

func (s *LongMangaStore) Save(state *domain.LongMangaState) error {
	dir := s.projectDir(state.ProjectID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create long manga directory: %w", err)
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal long manga state: %w", err)
	}

	if err := os.WriteFile(s.stateFile(state.ProjectID), data, 0o644); err != nil {
		return fmt.Errorf("failed to write long manga state: %w", err)
	}
	return nil
}

func (s *LongMangaStore) SaveOutline(projectID string, outline *domain.LongMangaOutline) (string, error) {
	if outline == nil {
		return "", fmt.Errorf("outline is required")
	}
	if err := os.MkdirAll(s.projectDir(projectID), 0o755); err != nil {
		return "", fmt.Errorf("failed to create long manga directory: %w", err)
	}
	data, err := json.MarshalIndent(outline, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal long manga outline: %w", err)
	}
	path := s.outlineFile(projectID)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", fmt.Errorf("failed to write long manga outline: %w", err)
	}
	return path, nil
}

func (s *LongMangaStore) SaveEpisodeScript(projectID string, script domain.LongMangaEpisodeScript) (string, error) {
	storyboardsDir := filepath.Join(s.projectDir(projectID), "storyboards")
	if err := os.MkdirAll(storyboardsDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create storyboards directory: %w", err)
	}

	filename := fmt.Sprintf("long_episode_%03d.md", script.Episode)
	path := filepath.Join(storyboardsDir, filename)
	if err := os.WriteFile(path, []byte(formatLongMangaEpisodeScript(script)), 0o644); err != nil {
		return "", fmt.Errorf("failed to write long manga episode script: %w", err)
	}
	return filepath.Join("storyboards", filename), nil
}

func (s *LongMangaStore) Load(projectID string) (*domain.LongMangaState, error) {
	data, err := os.ReadFile(s.stateFile(projectID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("long manga state for project %s not found", projectID)
		}
		return nil, fmt.Errorf("failed to read long manga state: %w", err)
	}

	var state domain.LongMangaState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, fmt.Errorf("failed to unmarshal long manga state: %w", err)
	}
	return &state, nil
}

func (s *LongMangaStore) StatePath(projectID string) string {
	return s.stateFile(projectID)
}

func (s *LongMangaStore) OutlinePath(projectID string) string {
	return s.outlineFile(projectID)
}

func (s *LongMangaStore) projectDir(projectID string) string {
	return filepath.Join(s.rootDir, projectID)
}

func (s *LongMangaStore) stateFile(projectID string) string {
	return filepath.Join(s.projectDir(projectID), "long_manga.json")
}

func (s *LongMangaStore) outlineFile(projectID string) string {
	return filepath.Join(s.projectDir(projectID), "long_outline.json")
}

func formatLongMangaEpisodeScript(script domain.LongMangaEpisodeScript) string {
	var out string
	out += fmt.Sprintf("#### 【第 %d 话】%s\n\n", script.Episode, script.Title)
	if script.Summary != "" {
		out += fmt.Sprintf("**梗概**：%s\n\n", script.Summary)
	}
	if len(script.CharacterIDs) > 0 {
		out += fmt.Sprintf("**角色引用**：%s\n\n", strings.Join(script.CharacterIDs, ", "))
	}
	for i, panel := range script.Panels {
		if i > 0 {
			out += "\n\n"
		}
		out += panel.Content
	}
	out += "\n"
	return out
}
