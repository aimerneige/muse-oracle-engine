package pipeline

import (
	"context"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
	"github.com/aimerneige/lovelive-manga-generator/internal/service"
)

// StoryStep wraps the story service as a pipeline step.
type StoryStep struct {
	svc *service.StoryService
}

func NewStoryStep(svc *service.StoryService) *StoryStep {
	return &StoryStep{svc: svc}
}

func (s *StoryStep) ID() StepID { return StepGenerateStory }

func (s *StoryStep) Execute(ctx context.Context, project *domain.Project) error {
	return s.svc.GenerateStory(ctx, project)
}

// StoryboardStep wraps the storyboard generation as a pipeline step.
type StoryboardStep struct {
	svc *service.StoryService
}

func NewStoryboardStep(svc *service.StoryService) *StoryboardStep {
	return &StoryboardStep{svc: svc}
}

func (s *StoryboardStep) ID() StepID { return StepGenerateStoryboard }

func (s *StoryboardStep) Execute(ctx context.Context, project *domain.Project) error {
	return s.svc.GenerateStoryboard(ctx, project)
}

// ImageStep wraps the comic image generation as a pipeline step.
type ImageStep struct {
	svc *service.ComicService
}

func NewImageStep(svc *service.ComicService) *ImageStep {
	return &ImageStep{svc: svc}
}

func (s *ImageStep) ID() StepID { return StepGenerateImages }

func (s *ImageStep) Execute(ctx context.Context, project *domain.Project) error {
	return s.svc.GenerateAllImages(ctx, project)
}
