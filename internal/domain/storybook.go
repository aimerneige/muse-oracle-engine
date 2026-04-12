package domain

// StoryResult holds the output of story generation (pipeline step 1).
type StoryResult struct {
	// CharacterSetting is the global character appearance setting
	// generated/confirmed by the LLM, in markdown format.
	CharacterSetting string `json:"character_setting"`

	// PlotOutline is the episode-by-episode plot outline in markdown format.
	PlotOutline string `json:"plot_outline"`

	// RawResponse is the raw LLM response for debugging and auditing.
	RawResponse string `json:"raw_response"`
}

// StoryboardPanel represents a single panel description in the storyboard.
type StoryboardPanel struct {
	Index   int    `json:"index"`   // 1-based panel index
	Content string `json:"content"` // full visual description for this panel
}

// Storyboard holds the output of storyboard generation (pipeline step 2).
type Storyboard struct {
	// Panels contains all panel descriptions, each ready to be sent to the image generator.
	Panels []StoryboardPanel `json:"panels"`

	// RawResponse is the raw LLM response for debugging and auditing.
	RawResponse string `json:"raw_response"`
}

// ImageResult holds the output of a single image generation.
type ImageResult struct {
	Index    int    `json:"index"`     // 1-based panel index
	FilePath string `json:"file_path"` // relative path to the generated image file
	Status   string `json:"status"`    // "pending", "done", "failed"
	Error    string `json:"error,omitempty"`
}
