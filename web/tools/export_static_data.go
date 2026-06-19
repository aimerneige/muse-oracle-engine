//go:build ignore

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/aimerneige/muse-oracle-engine/internal/chardb"
	"github.com/aimerneige/muse-oracle-engine/internal/domain"
)

type staticData struct {
	Series                      []domain.Series              `json:"series"`
	Characters                  []domain.Character           `json:"characters"`
	Styles                      []domain.StyleMeta           `json:"styles"`
	StorybookTemplate           string                       `json:"storybookTemplate"`
	LongOutlineTemplate         string                       `json:"longOutlineTemplate"`
	LongEpisodeTemplate         string                       `json:"longEpisodeTemplate"`
	FourPanelOutlineTemplate    string                       `json:"fourPanelOutlineTemplate"`
	FourPanelStoryboardTemplate string                       `json:"fourPanelStoryboardTemplate"`
	ComicTemplates              map[domain.ComicStyle]string `json:"comicTemplates"`
	LLMModels                   map[string][]string          `json:"llmModels"`
	ImageModels                 map[string][]string          `json:"imageModels"`
	DefaultEndpoints            map[string]map[string]string `json:"defaultEndpoints"`
	ImageSizes                  []string                     `json:"imageSizes"`
}

func main() {
	reg, err := chardb.NewEmbeddedRegistry()
	if err != nil {
		fail(err)
	}

	series := reg.ListSeries()
	sort.Slice(series, func(i, j int) bool {
		return series[i].ID < series[j].ID
	})

	characters := reg.ListCharacters("")
	sort.Slice(characters, func(i, j int) bool {
		if characters[i].Series == characters[j].Series {
			return characters[i].ID < characters[j].ID
		}
		return characters[i].Series < characters[j].Series
	})

	styles := make([]domain.StyleMeta, 0, len(domain.StyleRegistry))
	for _, style := range domain.StyleRegistry {
		styles = append(styles, style)
	}
	sort.Slice(styles, func(i, j int) bool {
		return styles[i].ID < styles[j].ID
	})

	storybook, err := os.ReadFile("internal/prompt/templates/storybook/generate.md.tmpl")
	if err != nil {
		fail(err)
	}
	longOutline, err := os.ReadFile("internal/prompt/templates/storybook/long_outline.md.tmpl")
	if err != nil {
		fail(err)
	}
	longEpisode, err := os.ReadFile("internal/prompt/templates/storybook/long_episode.md.tmpl")
	if err != nil {
		fail(err)
	}
	fourPanelOutline, err := os.ReadFile("internal/prompt/templates/storybook/four_panel_outline.md.tmpl")
	if err != nil {
		fail(err)
	}
	fourPanelStoryboard, err := os.ReadFile("internal/prompt/templates/storybook/four_panel_storyboard.md.tmpl")
	if err != nil {
		fail(err)
	}

	comicTemplates := make(map[domain.ComicStyle]string, len(styles))
	for _, style := range styles {
		path := filepath.Join("internal/prompt/templates/comic_draw", style.TemplateKey+".md.tmpl")
		content, err := os.ReadFile(path)
		if err != nil {
			fail(err)
		}
		comicTemplates[style.ID] = string(content)
	}

	data := staticData{
		Series:                      series,
		Characters:                  characters,
		Styles:                      styles,
		StorybookTemplate:           string(storybook),
		LongOutlineTemplate:         string(longOutline),
		LongEpisodeTemplate:         string(longEpisode),
		FourPanelOutlineTemplate:    string(fourPanelOutline),
		FourPanelStoryboardTemplate: string(fourPanelStoryboard),
		ComicTemplates:              comicTemplates,
		LLMModels: map[string][]string{
			"gemini": {
				"gemini-3.1-pro-preview",
				"gemini-3-flash-preview",
				"gemini-3.1-flash-lite-preview",
				"gemini-2.5-pro",
				"gemini-2.5-flash",
				"gemini-2.5-flash-lite",
			},
			"openai": {
				"gpt-5.5",
			},
		},
		ImageModels: map[string][]string{
			"gemini": {
				"gemini-3.1-flash-image",
				"gemini-3-pro-image",
				"gemini-2.5-flash-image",
			},
			"openai": {
				"gpt-image-2",
			},
		},
		DefaultEndpoints: map[string]map[string]string{
			"gemini": {
				"llm":   "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
				"image": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
			},
			"openai": {
				"llm":   "https://api.openai.com/v1/chat/completions",
				"image": "https://api.openai.com/v1/images/generations",
			},
		},
		ImageSizes: []string{"1K", "2K", "4K"},
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		fail(err)
	}

	output := "window.LLE_DATA = " + string(jsonData) + ";\n"
	if err := os.WriteFile("web/src/data.js", []byte(output), 0o644); err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
