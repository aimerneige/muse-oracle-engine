package chardb

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
	"gopkg.in/yaml.v3"
)

// Registry provides access to pre-defined anime character profiles.
type Registry struct {
	series     map[string]domain.Series
	characters map[string]domain.Character // key: "series/id", e.g. "lovelive/honoka"
}

// NewRegistry creates a new character registry by scanning the given data directory.
// The directory structure should be:
//
//	dataDir/
//	  lovelive/
//	    _series.yaml
//	    honoka.yaml
//	    umi.yaml
//	  bocchi/
//	    _series.yaml
//	    hitori.yaml
func NewRegistry(dataDir string) (*Registry, error) {
	r := &Registry{
		series:     make(map[string]domain.Series),
		characters: make(map[string]domain.Character),
	}

	if dataDir == "" {
		return r, nil
	}

	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read chardb directory %s: %w", dataDir, err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		seriesDir := filepath.Join(dataDir, entry.Name())
		if err := r.loadSeries(seriesDir, entry.Name()); err != nil {
			return nil, fmt.Errorf("failed to load series %s: %w", entry.Name(), err)
		}
	}

	return r, nil
}

// NewEmbeddedRegistry creates a registry using the embedded character data.
func NewEmbeddedRegistry() (*Registry, error) {
	r := &Registry{
		series:     make(map[string]domain.Series),
		characters: make(map[string]domain.Character),
	}

	if err := r.loadEmbeddedData(); err != nil {
		return nil, err
	}

	return r, nil
}

func (r *Registry) loadSeries(dirPath, seriesID string) error {
	// Load series metadata
	seriesFile := filepath.Join(dirPath, "_series.yaml")
	if data, err := os.ReadFile(seriesFile); err == nil {
		var s domain.Series
		if err := yaml.Unmarshal(data, &s); err != nil {
			return fmt.Errorf("failed to parse %s: %w", seriesFile, err)
		}
		if s.ID == "" {
			s.ID = seriesID
		}
		r.series[s.ID] = s
	}

	// Load character files
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || entry.Name() == "_series.yaml" || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		charFile := filepath.Join(dirPath, entry.Name())
		data, err := os.ReadFile(charFile)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", charFile, err)
		}

		var c domain.Character
		if err := yaml.Unmarshal(data, &c); err != nil {
			return fmt.Errorf("failed to parse %s: %w", charFile, err)
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

// ListSeries returns all available anime series.
func (r *Registry) ListSeries() []domain.Series {
	result := make([]domain.Series, 0, len(r.series))
	for _, s := range r.series {
		result = append(result, s)
	}
	return result
}

// ListCharacters returns all characters, optionally filtered by series.
func (r *Registry) ListCharacters(seriesFilter string) []domain.Character {
	result := make([]domain.Character, 0)
	for _, c := range r.characters {
		if seriesFilter == "" || c.Series == seriesFilter {
			result = append(result, c)
		}
	}
	return result
}

// GetCharacter returns a character by its full ID (e.g. "lovelive/honoka").
func (r *Registry) GetCharacter(fullID string) (domain.Character, bool) {
	c, ok := r.characters[fullID]
	return c, ok
}

// GetCharacterBySeriesAndID returns a character by series and character ID.
func (r *Registry) GetCharacterBySeriesAndID(series, id string) (domain.Character, bool) {
	return r.GetCharacter(series + "/" + id)
}

// LoadExternalDir merges character data from an external filesystem directory
// into this registry. This allows users to add custom characters by placing
// YAML files in a data directory.
func (r *Registry) LoadExternalDir(dataDir string) error {
	if dataDir == "" {
		return nil
	}

	info, err := os.Stat(dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // external dir not present, skip silently
		}
		return fmt.Errorf("failed to stat external chardb dir: %w", err)
	}
	if !info.IsDir() {
		return nil
	}

	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return fmt.Errorf("failed to read external chardb dir: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		seriesDir := filepath.Join(dataDir, entry.Name())
		if err := r.loadSeries(seriesDir, entry.Name()); err != nil {
			return fmt.Errorf("failed to load external series %s: %w", entry.Name(), err)
		}
	}

	return nil
}

// AddCharacter programmatically adds or updates a character in the registry.
func (r *Registry) AddCharacter(c domain.Character) {
	key := c.Series + "/" + c.ID
	r.characters[key] = c
}

// AddSeries programmatically adds or updates a series in the registry.
func (r *Registry) AddSeries(s domain.Series) {
	r.series[s.ID] = s
}

// CharacterCount returns the total number of registered characters.
func (r *Registry) CharacterCount() int {
	return len(r.characters)
}
