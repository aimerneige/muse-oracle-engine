package domain

import "time"

// LongMangaStatus represents the current state of a long manga generation task.
type LongMangaStatus string

const (
	LongMangaStatusOutlineGenerated  LongMangaStatus = "outline_generated"
	LongMangaStatusOutlineConfirmed  LongMangaStatus = "outline_confirmed"
	LongMangaStatusStoryboardPartial LongMangaStatus = "storyboard_partial"
	LongMangaStatusStoryboardDone    LongMangaStatus = "storyboard_done"
	LongMangaStatusFailed            LongMangaStatus = "failed"
)

// LongMangaState is the standalone JSON state for multi-round manga generation.
type LongMangaState struct {
	ProjectID           string                   `json:"project_id"`
	Status              LongMangaStatus          `json:"status"`
	PlotHint            string                   `json:"plot_hint"`
	Style               ComicStyle               `json:"style"`
	Language            string                   `json:"language"`
	CandidateCharacters []LongMangaCharacterRef  `json:"candidate_characters"`
	Outline             *LongMangaOutline        `json:"outline,omitempty"`
	ConfirmedOutline    *LongMangaOutline        `json:"confirmed_outline,omitempty"`
	Episodes            []LongMangaEpisodeScript `json:"episodes,omitempty"`
	RawResponses        map[string]string        `json:"raw_responses,omitempty"`
	Error               string                   `json:"error,omitempty"`
	CreatedAt           time.Time                `json:"created_at"`
	UpdatedAt           time.Time                `json:"updated_at"`
}

// LongMangaCharacterRef is the stable character identity exposed to the LLM.
type LongMangaCharacterRef struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	NameEN string `json:"name_en"`
	Series string `json:"series"`
}

// LongMangaOutline is the human-confirmable episode outline.
type LongMangaOutline struct {
	TotalEpisodes int                       `json:"total_episodes"`
	Episodes      []LongMangaEpisodeOutline `json:"episodes"`
}

// LongMangaEpisodeOutline describes one episode before storyboard expansion.
type LongMangaEpisodeOutline struct {
	Episode      int      `json:"episode"`
	Title        string   `json:"title"`
	Summary      string   `json:"summary"`
	CharacterIDs []string `json:"character_ids"`
}

// LongMangaEpisodeScript is one generated episode storyboard.
type LongMangaEpisodeScript struct {
	Episode      int                    `json:"episode"`
	Title        string                 `json:"title"`
	Summary      string                 `json:"summary"`
	CharacterIDs []string               `json:"character_ids"`
	Panels       []LongMangaPanelScript `json:"panels"`
	RawResponse  string                 `json:"raw_response,omitempty"`
}

// LongMangaPanelScript is one panel in a generated long manga episode.
type LongMangaPanelScript struct {
	Index        int      `json:"index"`
	CharacterIDs []string `json:"character_ids"`
	Content      string   `json:"content"`
}
