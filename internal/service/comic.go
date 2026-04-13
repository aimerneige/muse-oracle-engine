package service

import (
	"context"
	"fmt"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
	"github.com/aimerneige/lovelive-manga-generator/internal/prompt"
	"github.com/aimerneige/lovelive-manga-generator/internal/provider/image"
	"github.com/aimerneige/lovelive-manga-generator/internal/storage"
)

// ComicService handles comic image generation.
type ComicService struct {
	imgProvider  image.Provider
	promptEngine *prompt.Engine
	store        storage.Store
}

// NewComicService creates a new comic image generation service.
func NewComicService(provider image.Provider, engine *prompt.Engine, store storage.Store) *ComicService {
	return &ComicService{
		imgProvider:  provider,
		promptEngine: engine,
		store:        store,
	}
}

// GenerateAllImages generates images for all storyboard panels.
// Updates project.Images with results (including failures).
func (s *ComicService) GenerateAllImages(ctx context.Context, project *domain.Project) error {
	if project.Storyboard == nil {
		return fmt.Errorf("storyboard is required — run step 2 first")
	}
	if project.StoryResult == nil {
		return fmt.Errorf("story result is required — run step 1 first")
	}

	// Initialize image results if not already present
	if len(project.Images) == 0 {
		project.Images = make([]domain.ImageResult, len(project.Storyboard.Panels))
		for i := range project.Images {
			project.Images[i] = domain.ImageResult{
				Index:   i + 1,
				Status:  "pending",
				Attempt: 1,
			}
		}
	}

	for i, panel := range project.Storyboard.Panels {
		// Skip already completed images
		if project.Images[i].Status == "done" {
			continue
		}

		if err := s.GenerateSingleImage(ctx, project, panel.Index); err != nil {
			project.Images[i].Status = "failed"
			project.Images[i].Error = err.Error()
			// Continue to next panel instead of aborting
			continue
		}
	}

	project.Status = domain.StatusImagesDone
	return nil
}

// GenerateSingleImage generates an image for a single storyboard panel.
func (s *ComicService) GenerateSingleImage(ctx context.Context, project *domain.Project, panelIndex int) error {
	if panelIndex < 1 || panelIndex > len(project.Storyboard.Panels) {
		return fmt.Errorf("panel index %d out of range [1, %d]", panelIndex, len(project.Storyboard.Panels))
	}

	panel := project.Storyboard.Panels[panelIndex-1]

	// Render the comic draw prompt
	promptText, err := s.promptEngine.RenderComicDraw(project.Style, prompt.ComicDrawData{
		Characters:       project.Characters,
		CharacterSetting: project.StoryResult.CharacterSetting,
		PanelContent:     panel.Content,
	})
	if err != nil {
		return fmt.Errorf("failed to render comic draw prompt: %w", err)
	}

	// Generate image
	imageData, err := s.imgProvider.GenerateImage(ctx, promptText)
	if err != nil {
		return fmt.Errorf("image generation failed for panel %d: %w", panelIndex, err)
	}

	// If no image data returned (e.g. dry-run/prompt-only mode), skip saving
	if len(imageData) == 0 {
		idx := panelIndex - 1
		if idx < len(project.Images) {
			project.Images[idx].Status = "done"
			project.Images[idx].Error = ""
		}
		return nil
	}

	// Save image
	idx := panelIndex - 1
	attempt := 1
	if idx < len(project.Images) && project.Images[idx].Attempt > 0 {
		attempt = project.Images[idx].Attempt
	}
	relPath, err := s.store.SaveImage(project.ID, panelIndex, attempt, imageData)
	if err != nil {
		return fmt.Errorf("failed to save image for panel %d: %w", panelIndex, err)
	}

	// Update project state
	if idx < len(project.Images) {
		project.Images[idx].FilePath = relPath
		project.Images[idx].Status = "done"
		project.Images[idx].Error = ""
	}

	return nil
}
