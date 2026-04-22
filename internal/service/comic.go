package service

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/image"
	"github.com/aimerneige/muse-oracle-engine/internal/storage"
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

	maxConcurrency := 3
	sem := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup

	log.Printf("Starting concurrent image generation for project %s with %d panels", project.ID, len(project.Storyboard.Panels))

	for i, panel := range project.Storyboard.Panels {
		// Skip already completed images
		if project.Images[i].Status == "done" {
			log.Printf("Panel %d already generated, skipping", panel.Index)
			continue
		}

		wg.Add(1)
		sem <- struct{}{} // Acquire concurrency token

		go func(i int, panel domain.StoryboardPanel) {
			defer wg.Done()
			defer func() { <-sem }() // Release concurrency token

			log.Printf("Generating image for panel %d...", panel.Index)

			if err := s.GenerateSingleImage(ctx, project, panel.Index); err != nil {
				log.Printf("Failed to generate image for panel %d: %v", panel.Index, err)
				project.Images[i].Status = "failed"
				project.Images[i].Error = err.Error()
			} else {
				log.Printf("Successfully generated image for panel %d", panel.Index)
			}
		}(i, panel)
	}

	wg.Wait()
	log.Printf("Finished concurrent image generation for project %s", project.ID)

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
	idx := panelIndex - 1
	attempt := 1
	if idx < len(project.Images) && project.Images[idx].Attempt > 0 {
		attempt = project.Images[idx].Attempt
	}

	if _, err := s.store.SavePrompt(project.ID, panelIndex, attempt, promptText); err != nil {
		return fmt.Errorf("failed to save prompt for panel %d: %w", panelIndex, err)
	}

	imageData, err := s.imgProvider.GenerateImage(ctx, promptText)
	if err != nil {
		return fmt.Errorf("image generation failed for panel %d: %w", panelIndex, err)
	}

	// If no image data returned (e.g. dry-run/prompt-only mode), skip saving
	if len(imageData) == 0 {
		if idx < len(project.Images) {
			project.Images[idx].Status = "done"
			project.Images[idx].Error = ""
		}
		return nil
	}

	// Save image
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
