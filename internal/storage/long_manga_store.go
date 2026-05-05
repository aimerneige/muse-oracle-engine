package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

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

func (s *LongMangaStore) projectDir(projectID string) string {
	return filepath.Join(s.rootDir, projectID)
}

func (s *LongMangaStore) stateFile(projectID string) string {
	return filepath.Join(s.projectDir(projectID), "long_manga.json")
}
