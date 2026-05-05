package domain

import (
	"strings"
	"time"
)

// ProjectStatus represents the current state of a project in the pipeline.
type ProjectStatus string

const (
	StatusCreated        ProjectStatus = "created"
	StatusStoryboardDone ProjectStatus = "storyboard_done"
	StatusReviewPending  ProjectStatus = "review_pending"
	StatusReviewApproved ProjectStatus = "review_approved"
	StatusImagesDone     ProjectStatus = "images_done"
	StatusFailed         ProjectStatus = "failed"
)

const DefaultLanguage = "中文"

// Project represents a manga generation session with all intermediate state.
type Project struct {
	ID         string        `json:"id"`
	Status     ProjectStatus `json:"status"`
	Characters []Character   `json:"characters"`  // selected characters with full profiles
	PlotHint   string        `json:"plot_hint"`   // user-provided story direction
	Style      ComicStyle    `json:"style"`       // selected comic style
	Language   string        `json:"language"`    // speech bubble dialogue language
	LLMModel   string        `json:"llm_model"`   // model used for text generation
	ImageModel string        `json:"image_model"` // model used for image generation

	// Pipeline intermediate results
	StoryResult *StoryResult  `json:"story_result,omitempty"`
	Storyboard  *Storyboard   `json:"storyboard,omitempty"`
	Images      []ImageResult `json:"images,omitempty"`

	// Review feedback
	ReviewFeedback string `json:"review_feedback,omitempty"`

	// LLM conversation history for multi-turn generation
	History []HistoryMessage `json:"history,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func NormalizeLanguage(language string) string {
	language = strings.TrimSpace(language)
	if language == "" {
		return DefaultLanguage
	}
	return language
}

// HistoryMessage represents a single message in the LLM conversation history.
type HistoryMessage struct {
	Role    string `json:"role"` // "user", "assistant", "system"
	Content string `json:"content"`
}

// IsStepCompleted checks if a pipeline step has already been completed.
func (p *Project) IsStepCompleted(step string) bool {
	switch step {
	case "generate_storyboard":
		return p.Status != StatusCreated && p.Status != StatusFailed
	case "review_storyboard":
		return p.Status != StatusReviewPending
	case "generate_images":
		return p.Status == StatusImagesDone
	default:
		return false
	}
}

// ResetToStep resets the project state so that all steps from the given step onward
// can be re-executed. This is used for retry functionality.
func (p *Project) ResetToStep(step string) {
	p.UpdatedAt = time.Now()
	switch step {
	case "generate_storyboard":
		p.Status = StatusCreated
		p.StoryResult = nil
		p.Storyboard = nil
		p.Images = nil
		p.History = nil
		p.ReviewFeedback = ""
	case "review_storyboard":
		p.Status = StatusStoryboardDone
		p.Images = nil
		p.ReviewFeedback = ""
	case "generate_images":
		p.Status = StatusReviewApproved
		p.Images = nil
	}
}

// ResetSingleImage resets a single image so it can be re-generated.
// It increments the attempt counter to avoid overwriting previous images.
func (p *Project) ResetSingleImage(index int) {
	if index < 1 || index > len(p.Images) {
		return
	}
	img := &p.Images[index-1]
	img.Status = "pending"
	img.Error = ""
	img.FilePath = ""
	img.Attempt++
	// If project was marked done, revert to approved for re-generation
	if p.Status == StatusImagesDone {
		p.Status = StatusReviewApproved
	}
	p.UpdatedAt = time.Now()
}
