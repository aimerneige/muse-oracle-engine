package chardb

import (
	"embed"
	"fmt"
	"strings"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
	"gopkg.in/yaml.v3"
)

//go:embed all:data
var embeddedData embed.FS

func (r *Registry) loadEmbeddedData() error {
	entries, err := embeddedData.ReadDir("data")
	if err != nil {
		return fmt.Errorf("failed to read embedded chardb data: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		seriesID := entry.Name()
		if err := r.loadEmbeddedSeries(seriesID); err != nil {
			return fmt.Errorf("failed to load embedded series %s: %w", seriesID, err)
		}
	}

	return nil
}

func (r *Registry) loadEmbeddedSeries(seriesID string) error {
	// Load series metadata
	seriesPath := fmt.Sprintf("data/%s/_series.yaml", seriesID)
	if data, err := embeddedData.ReadFile(seriesPath); err == nil {
		var s domain.Series
		if err := yaml.Unmarshal(data, &s); err != nil {
			return fmt.Errorf("failed to parse %s: %w", seriesPath, err)
		}
		if s.ID == "" {
			s.ID = seriesID
		}
		r.series[s.ID] = s
	}

	return r.loadEmbeddedCharactersRecursive(fmt.Sprintf("data/%s", seriesID), seriesID)
}

// loadEmbeddedCharactersRecursive recursively scans an embedded directory tree for character YAML files.
func (r *Registry) loadEmbeddedCharactersRecursive(dirPath, seriesID string) error {
	entries, err := embeddedData.ReadDir(dirPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.Name() == "_series.yaml" {
			continue
		}

		fullPath := fmt.Sprintf("%s/%s", dirPath, entry.Name())

		if entry.IsDir() {
			// Recurse into subdirectories (e.g., region subdirs like liyue/, mondstadt/)
			if err := r.loadEmbeddedCharactersRecursive(fullPath, seriesID); err != nil {
				return err
			}
			continue
		}

		if !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		data, err := embeddedData.ReadFile(fullPath)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", fullPath, err)
		}

		var c domain.Character
		if err := yaml.Unmarshal(data, &c); err != nil {
			return fmt.Errorf("failed to parse %s: %w", fullPath, err)
		}

		if c.Series == "" {
			c.Series = seriesID
		}
		if c.ID == "" {
			c.ID = strings.TrimSuffix(entry.Name(), ".yaml")
		}

		key := c.Series + "/" + c.ID
		r.characters[key] = c
	}

	return nil
}
