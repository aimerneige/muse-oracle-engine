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

const maxConcurrentImageJobs = 3

type imageJob struct {
	slot     int
	panel    domain.StoryboardPanel
	attempt  int
	previous domain.ImageResult
}

type imageJobResult struct {
	slot  int
	image domain.ImageResult
	err   error
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

	project.Images = buildImageState(project.Storyboard.Panels, project.Images)
	jobs := planImageJobs(project.Storyboard.Panels, project.Images)

	log.Printf("Starting concurrent image generation for project %s with %d panels", project.ID, len(project.Storyboard.Panels))
	results := s.runImageJobs(ctx, project, jobs)
	project.Images = mergeImageResults(project.Images, results)
	log.Printf("Finished concurrent image generation for project %s", project.ID)

	project.Status = projectStatusFromImages(project.Images)
	return combineImageErrors(results)
}

// GenerateSingleImage generates an image for a single storyboard panel.
func (s *ComicService) GenerateSingleImage(ctx context.Context, project *domain.Project, panelIndex int) error {
	if project.Storyboard == nil {
		return fmt.Errorf("storyboard is required — run step 2 first")
	}
	if project.StoryResult == nil {
		return fmt.Errorf("story result is required — run step 1 first")
	}
	if panelIndex < 1 || panelIndex > len(project.Storyboard.Panels) {
		return fmt.Errorf("panel index %d out of range [1, %d]", panelIndex, len(project.Storyboard.Panels))
	}

	project.Images = buildImageState(project.Storyboard.Panels, project.Images)
	job := imageJob{
		slot:     panelIndex - 1,
		panel:    project.Storyboard.Panels[panelIndex-1],
		attempt:  project.Images[panelIndex-1].Attempt,
		previous: project.Images[panelIndex-1],
	}

	result := s.runImageJob(ctx, project, job)
	project.Images = mergeImageResults(project.Images, []imageJobResult{result})
	project.Status = projectStatusFromImages(project.Images)
	return result.err
}

func buildImageState(panels []domain.StoryboardPanel, existing []domain.ImageResult) []domain.ImageResult {
	images := make([]domain.ImageResult, len(panels))
	for i, panel := range panels {
		base := domain.ImageResult{
			Index:   panel.Index,
			Status:  "pending",
			Attempt: 1,
		}
		if i < len(existing) {
			base = normalizeImageResult(panel.Index, existing[i])
		}
		images[i] = base
	}
	return images
}

func normalizeImageResult(index int, image domain.ImageResult) domain.ImageResult {
	if image.Index == 0 {
		image.Index = index
	}
	if image.Status == "" {
		image.Status = "pending"
	}
	if image.Attempt <= 0 {
		image.Attempt = 1
	}
	return image
}

func planImageJobs(panels []domain.StoryboardPanel, images []domain.ImageResult) []imageJob {
	jobs := make([]imageJob, 0, len(panels))
	for i, panel := range panels {
		if i < len(images) && images[i].Status == "done" {
			log.Printf("Panel %d already generated, skipping", panel.Index)
			continue
		}

		planned := domain.ImageResult{Index: panel.Index, Attempt: 1}
		if i < len(images) {
			planned = images[i]
		}

		jobs = append(jobs, imageJob{
			slot:     i,
			panel:    panel,
			attempt:  planned.Attempt,
			previous: planned,
		})
	}
	return jobs
}

func (s *ComicService) runImageJobs(ctx context.Context, project *domain.Project, jobs []imageJob) []imageJobResult {
	results := make([]imageJobResult, 0, len(jobs))
	if len(jobs) == 0 {
		return results
	}

	sem := make(chan struct{}, maxConcurrentImageJobs)
	resultsCh := make(chan imageJobResult, len(jobs))
	var wg sync.WaitGroup

	for _, job := range jobs {
		wg.Add(1)
		sem <- struct{}{}

		go func(job imageJob) {
			defer wg.Done()
			defer func() { <-sem }()
			resultsCh <- s.runImageJob(ctx, project, job)
		}(job)
	}

	wg.Wait()
	close(resultsCh)

	for result := range resultsCh {
		results = append(results, result)
	}
	return results
}

func (s *ComicService) runImageJob(ctx context.Context, project *domain.Project, job imageJob) imageJobResult {
	log.Printf("Generating image for panel %d...", job.panel.Index)

	promptText, err := s.promptEngine.RenderComicDraw(project.Style, prompt.ComicDrawData{
		Characters:       project.Characters,
		CharacterSetting: project.StoryResult.CharacterSetting,
		PanelContent:     job.panel.Content,
	})
	if err != nil {
		return failedImageJobResult(job, fmt.Errorf("failed to render comic draw prompt: %w", err))
	}

	if _, err := s.store.SavePrompt(project.ID, job.panel.Index, job.attempt, promptText); err != nil {
		return failedImageJobResult(job, fmt.Errorf("failed to save prompt for panel %d: %w", job.panel.Index, err))
	}

	imageData, err := s.imgProvider.GenerateImage(ctx, promptText)
	if err != nil {
		return failedImageJobResult(job, fmt.Errorf("image generation failed for panel %d: %w", job.panel.Index, err))
	}

	result := normalizeImageResult(job.panel.Index, job.previous)
	result.Status = "done"
	result.Error = ""

	if len(imageData) == 0 {
		log.Printf("Successfully generated image for panel %d", job.panel.Index)
		return imageJobResult{slot: job.slot, image: result}
	}

	relPath, err := s.store.SaveImage(project.ID, job.panel.Index, job.attempt, imageData)
	if err != nil {
		return failedImageJobResult(job, fmt.Errorf("failed to save image for panel %d: %w", job.panel.Index, err))
	}

	result.FilePath = relPath
	log.Printf("Successfully generated image for panel %d", job.panel.Index)
	return imageJobResult{slot: job.slot, image: result}
}

func failedImageJobResult(job imageJob, err error) imageJobResult {
	log.Printf("Failed to generate image for panel %d: %v", job.panel.Index, err)

	result := normalizeImageResult(job.panel.Index, job.previous)
	result.Status = "failed"
	result.Error = err.Error()
	result.FilePath = ""

	return imageJobResult{
		slot:  job.slot,
		image: result,
		err:   err,
	}
}

func mergeImageResults(images []domain.ImageResult, results []imageJobResult) []domain.ImageResult {
	merged := append([]domain.ImageResult(nil), images...)
	for _, result := range results {
		if result.slot < 0 || result.slot >= len(merged) {
			continue
		}
		merged[result.slot] = normalizeImageResult(merged[result.slot].Index, result.image)
	}
	return merged
}

func projectStatusFromImages(images []domain.ImageResult) domain.ProjectStatus {
	if len(images) == 0 {
		return domain.StatusReviewApproved
	}
	for _, image := range images {
		if image.Status != "done" {
			return domain.StatusReviewApproved
		}
	}
	return domain.StatusImagesDone
}

func combineImageErrors(results []imageJobResult) error {
	var firstErr error
	failedCount := 0
	for _, result := range results {
		if result.err == nil {
			continue
		}
		failedCount++
		if firstErr == nil {
			firstErr = result.err
		}
	}
	if firstErr == nil {
		return nil
	}
	return fmt.Errorf("%d image(s) failed, first error: %w", failedCount, firstErr)
}
