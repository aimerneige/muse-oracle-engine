package storage

import "github.com/aimerneige/lovelive-manga-generator/internal/domain"

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
	SaveImage(projectID string, index int, data []byte) (string, error)

	// LoadImage reads image data for a specific panel.
	LoadImage(projectID string, index int) ([]byte, error)

	// ProjectDir returns the absolute path to a project's data directory.
	ProjectDir(projectID string) string
}
