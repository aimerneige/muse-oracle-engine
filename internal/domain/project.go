package domain

import "time"

// ProjectStatus represents the current state of a project in the pipeline.
type ProjectStatus string

const (
	StatusCreated        ProjectStatus = "created"
	StatusStoryDone      ProjectStatus = "story_done"
	StatusStoryboardDone ProjectStatus = "storyboard_done"
	StatusReviewPending  ProjectStatus = "review_pending"
	StatusReviewApproved ProjectStatus = "review_approved"
	StatusImagesDone     ProjectStatus = "images_done"
	StatusFailed         ProjectStatus = "failed"
)

// Project represents a manga generation session with all intermediate state.
type Project struct {
	ID         string        `json:"id"`
	Status     ProjectStatus `json:"status"`
	Characters []Character   `json:"characters"` // selected characters with full profiles
	PlotHint   string        `json:"plot_hint"`   // user-provided story direction
	Style      ComicStyle    `json:"style"`       // selected comic style
	LLMModel   string        `json:"llm_model"`   // model used for text generation
	ImageModel string        `json:"image_model"` // model used for image generation

	// Pipeline intermediate results
	StoryResult *StoryResult `json:"story_result,omitempty"`
	Storyboard  *Storyboard  `json:"storyboard,omitempty"`
	Images      []ImageResult `json:"images,omitempty"`

	// Review feedback
	ReviewFeedback string `json:"review_feedback,omitempty"`

	// LLM conversation history for multi-turn generation
	History []HistoryMessage `json:"history,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// HistoryMessage represents a single message in the LLM conversation history.
type HistoryMessage struct {
	Role    string `json:"role"`    // "user", "assistant", "system"
	Content string `json:"content"`
}

// IsStepCompleted checks if a pipeline step has already been completed.
func (p *Project) IsStepCompleted(step string) bool {
	switch step {
	case "generate_story":
		return p.Status != StatusCreated && p.Status != StatusFailed
	case "generate_storyboard":
		return p.Status != StatusCreated && p.Status != StatusStoryDone && p.Status != StatusFailed
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
	case "generate_story":
		p.Status = StatusCreated
		p.StoryResult = nil
		p.Storyboard = nil
		p.Images = nil
		p.History = nil
		p.ReviewFeedback = ""
	case "generate_storyboard":
		p.Status = StatusStoryDone
		p.Storyboard = nil
		p.Images = nil
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
func (p *Project) ResetSingleImage(index int) {
	if index < 1 || index > len(p.Images) {
		return
	}
	p.Images[index-1].Status = "pending"
	p.Images[index-1].Error = ""
	p.Images[index-1].FilePath = ""
	// If project was marked done, revert to approved for re-generation
	if p.Status == StatusImagesDone {
		p.Status = StatusReviewApproved
	}
	p.UpdatedAt = time.Now()
}

