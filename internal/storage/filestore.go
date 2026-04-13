package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
)

// FileStore implements Store using the local filesystem.
// Each project is stored in its own directory under rootDir:
//
//	rootDir/
//	  {project-id}/
//	    project.json     - project metadata and state
//	    images/
//	      001.png        - generated comic images
//	      002.png
//	    prompts/
//	      001.txt        - rendered prompts
//	      002.txt
type FileStore struct {
	rootDir string
}

// NewFileStore creates a new filesystem-based store.
func NewFileStore(rootDir string) (*FileStore, error) {
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create data directory %s: %w", rootDir, err)
	}
	return &FileStore{rootDir: rootDir}, nil
}

func (fs *FileStore) ProjectDir(projectID string) string {
	return filepath.Join(fs.rootDir, projectID)
}

func (fs *FileStore) Save(project *domain.Project) error {
	dir := fs.ProjectDir(project.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create project directory: %w", err)
	}

	data, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal project: %w", err)
	}

	projectFile := filepath.Join(dir, "project.json")
	if err := os.WriteFile(projectFile, data, 0o644); err != nil {
		return fmt.Errorf("failed to write project file: %w", err)
	}

	return nil
}

func (fs *FileStore) Load(id string) (*domain.Project, error) {
	projectFile := filepath.Join(fs.ProjectDir(id), "project.json")

	data, err := os.ReadFile(projectFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("project %s not found", id)
		}
		return nil, fmt.Errorf("failed to read project file: %w", err)
	}

	var project domain.Project
	if err := json.Unmarshal(data, &project); err != nil {
		return nil, fmt.Errorf("failed to unmarshal project: %w", err)
	}

	return &project, nil
}

func (fs *FileStore) Delete(id string) error {
	dir := fs.ProjectDir(id)
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("failed to delete project directory: %w", err)
	}
	return nil
}

func (fs *FileStore) List() ([]string, error) {
	entries, err := os.ReadDir(fs.rootDir)
	if err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}

	var ids []string
	for _, entry := range entries {
		if entry.IsDir() {
			// Verify it's a valid project by checking for project.json
			projectFile := filepath.Join(fs.rootDir, entry.Name(), "project.json")
			if _, err := os.Stat(projectFile); err == nil {
				ids = append(ids, entry.Name())
			}
		}
	}

	return ids, nil
}

func (fs *FileStore) SaveImage(projectID string, index int, attempt int, data []byte) (string, error) {
	imagesDir := filepath.Join(fs.ProjectDir(projectID), "images")
	if err := os.MkdirAll(imagesDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create images directory: %w", err)
	}

	var filename string
	if attempt <= 1 {
		filename = fmt.Sprintf("%03d.png", index)
	} else {
		filename = fmt.Sprintf("%03d_%d.png", index, attempt)
	}
	imagePath := filepath.Join(imagesDir, filename)

	if err := os.WriteFile(imagePath, data, 0o644); err != nil {
		return "", fmt.Errorf("failed to write image: %w", err)
	}

	// Return relative path from project dir
	return filepath.Join("images", filename), nil
}

func (fs *FileStore) SavePrompt(projectID string, index int, attempt int, prompt string) (string, error) {
	promptsDir := filepath.Join(fs.ProjectDir(projectID), "prompts")
	if err := os.MkdirAll(promptsDir, 0o755); err != nil {
		return "", fmt.Errorf("failed to create prompts directory: %w", err)
	}

	var filename string
	if attempt <= 1 {
		filename = fmt.Sprintf("%03d.txt", index)
	} else {
		filename = fmt.Sprintf("%03d_%d.txt", index, attempt)
	}
	promptPath := filepath.Join(promptsDir, filename)

	if err := os.WriteFile(promptPath, []byte(prompt), 0o644); err != nil {
		return "", fmt.Errorf("failed to write prompt: %w", err)
	}

	return filepath.Join("prompts", filename), nil
}

func (fs *FileStore) LoadImage(projectID string, index int) ([]byte, error) {
	// Try to resolve the filename from the project's ImageResult
	proj, err := fs.Load(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to load project: %w", err)
	}
	if index < 1 || index > len(proj.Images) {
		return nil, fmt.Errorf("image index %d out of range", index)
	}
	relPath := proj.Images[index-1].FilePath
	if relPath == "" {
		// Fallback for old projects without FilePath stored
		relPath = fmt.Sprintf("images/%03d.png", index)
	}
	return fs.LoadImageByPath(projectID, relPath)
}

func (fs *FileStore) LoadImageByPath(projectID string, relPath string) ([]byte, error) {
	imagePath := filepath.Join(fs.ProjectDir(projectID), relPath)

	data, err := os.ReadFile(imagePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read image: %w", err)
	}

	return data, nil
}
