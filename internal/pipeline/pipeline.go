package pipeline

import (
	"context"
	"fmt"
	"log"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
	"github.com/aimerneige/lovelive-manga-generator/internal/storage"
)

// StepID identifies a pipeline step.
type StepID string

const (
	StepGenerateStory      StepID = "generate_story"
	StepGenerateStoryboard StepID = "generate_storyboard"
	StepReviewStoryboard   StepID = "review_storyboard"
	StepGenerateImages     StepID = "generate_images"
)

// Step represents a single step in the generation pipeline.
type Step interface {
	ID() StepID
	Execute(ctx context.Context, project *domain.Project) error
}

// Pipeline orchestrates the execution of a sequence of steps,
// saving checkpoints between each step.
type Pipeline struct {
	steps []Step
	store storage.Store
}

// NewPipeline creates a new pipeline with the given steps and storage backend.
func NewPipeline(store storage.Store, steps ...Step) *Pipeline {
	return &Pipeline{
		steps: steps,
		store: store,
	}
}

// Run executes all pipeline steps sequentially.
// If the project has already completed a step, it is skipped.
// After each step, the project state is saved as a checkpoint.
func (p *Pipeline) Run(ctx context.Context, project *domain.Project) error {
	for _, step := range p.steps {
		if project.IsStepCompleted(string(step.ID())) {
			log.Printf("[Pipeline] Skipping completed step: %s", step.ID())
			continue
		}

		log.Printf("[Pipeline] Executing step: %s", step.ID())
		if err := step.Execute(ctx, project); err != nil {
			// Save progress even on failure
			if saveErr := p.store.Save(project); saveErr != nil {
				log.Printf("[Pipeline] WARNING: failed to save checkpoint after error: %v", saveErr)
			}
			return fmt.Errorf("step %s failed: %w", step.ID(), err)
		}

		// Save checkpoint after successful step
		if err := p.store.Save(project); err != nil {
			return fmt.Errorf("failed to save checkpoint after step %s: %w", step.ID(), err)
		}
		log.Printf("[Pipeline] Step %s completed and saved", step.ID())
	}

	return nil
}

// RunStep executes a single step by ID, regardless of project status.
// Useful for retrying a specific step.
func (p *Pipeline) RunStep(ctx context.Context, project *domain.Project, stepID StepID) error {
	for _, step := range p.steps {
		if step.ID() == stepID {
			log.Printf("[Pipeline] Executing single step: %s", stepID)
			if err := step.Execute(ctx, project); err != nil {
				if saveErr := p.store.Save(project); saveErr != nil {
					log.Printf("[Pipeline] WARNING: failed to save checkpoint: %v", saveErr)
				}
				return fmt.Errorf("step %s failed: %w", stepID, err)
			}
			return p.store.Save(project)
		}
	}
	return fmt.Errorf("step %s not found in pipeline", stepID)
}
