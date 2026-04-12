package chardb

import (
	"embed"
	"fmt"
	"strings"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
	"gopkg.in/yaml.v3"
)

//go:embed data/*
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

	// Load character files
	dirPath := fmt.Sprintf("data/%s", seriesID)
	entries, err := embeddedData.ReadDir(dirPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "_series.yaml" || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		charPath := fmt.Sprintf("%s/%s", dirPath, entry.Name())
		data, err := embeddedData.ReadFile(charPath)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", charPath, err)
		}

		var c domain.Character
		if err := yaml.Unmarshal(data, &c); err != nil {
			return fmt.Errorf("failed to parse %s: %w", charPath, err)
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
