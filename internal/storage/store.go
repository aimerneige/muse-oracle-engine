package storage

import "github.com/aimerneige/muse-oracle-engine/internal/domain"

// Store defines the interface for persisting project state.
type Store interface {
	// Save persists the project state to storage.
	Save(project *domain.Project) error

	// Load reads a project from storage by its ID.
	Load(id string) (*domain.Project, error)

	// Delete removes a project and all its associated data.
	Delete(id string) error

	// List returns all project IDs.
	List() ([]string, error)

	// SaveImage saves raw image data for a specific panel in a project.
	// The attempt parameter (1-based) is used to avoid overwriting previous
	// generations: attempt 1 → "001.png", attempt 2 → "001_2.png", etc.
	SaveImage(projectID string, index int, attempt int, data []byte) (string, error)

	// SavePrompt saves the rendered image prompt for a specific panel.
	// The attempt parameter (1-based) matches the image generation attempt
	// and is used to avoid overwriting previous prompt files.
	SavePrompt(projectID string, index int, attempt int, prompt string) (string, error)

	// LoadImage reads image data for a specific panel.
	// It resolves the correct filename by reading the project's ImageResult.FilePath,
	// which may include an attempt suffix (e.g. "001_2.png").
	LoadImage(projectID string, index int) ([]byte, error)

	// LoadImageByPath reads image data from a relative path within a project directory.
	LoadImageByPath(projectID string, relPath string) ([]byte, error)

	// ProjectDir returns the absolute path to a project's data directory.
	ProjectDir(projectID string) string
}
