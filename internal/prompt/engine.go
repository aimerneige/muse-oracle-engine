package prompt

import (
	"bytes"
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/template"

	"gopkg.in/yaml.v3"

	"github.com/aimerneige/lovelive-manga-generator/internal/domain"
)

//go:embed templates/*
var templatesFS embed.FS

// Engine renders prompt templates with dynamic data.
type Engine struct {
	templates *template.Template
}

// NewEngine creates a new prompt template engine, loading all templates from the embedded filesystem.
func NewEngine() (*Engine, error) {
	funcMap := template.FuncMap{
		"join": strings.Join,
	}

	tmpl, err := template.New("").Funcs(funcMap).ParseFS(templatesFS, "templates/**/*.md.tmpl")
	if err != nil {
		return nil, fmt.Errorf("failed to parse prompt templates: %w", err)
	}

	return &Engine{templates: tmpl}, nil
}

// StorybookData contains the data needed to render the storybook generation prompt.
type StorybookData struct {
	Characters []domain.Character
	PlotHint   string
}

// RenderStorybook renders the storybook generation prompt with character data and plot hint.
func (e *Engine) RenderStorybook(data StorybookData) (string, error) {
	return e.render("generate.md.tmpl", data)
}

// ComicDrawData contains the data needed to render a comic drawing prompt.
type ComicDrawData struct {
	Characters       []domain.Character
	CharacterSetting string // global character appearance setting from step 1
	PanelContent     string // single panel's visual description from storyboard
}

// RenderComicDraw renders a comic drawing prompt for the given style.
func (e *Engine) RenderComicDraw(style domain.ComicStyle, data ComicDrawData) (string, error) {
	meta, ok := domain.StyleRegistry[style]
	if !ok {
		return "", fmt.Errorf("unknown comic style: %s", style)
	}
	templateName := meta.TemplateKey + ".md.tmpl"
	return e.render(templateName, data)
}

func (e *Engine) render(name string, data any) (string, error) {
	var buf bytes.Buffer
	if err := e.templates.ExecuteTemplate(&buf, name, data); err != nil {
		return "", fmt.Errorf("failed to render template %s: %w", name, err)
	}
	return buf.String(), nil
}

type externalStyleDef struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
}

// LoadExternalDir scans a directory for custom comic styles and registers them.
// Structure:
//
//	dir/
//	  my_style/
//	    style.yaml
//	    draw.md.tmpl
func (e *Engine) LoadExternalDir(dir string) error {
	if dir == "" {
		return nil
	}

	info, err := os.Stat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to stat external styles dir: %w", err)
	}
	if !info.IsDir() {
		return nil
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("failed to read styles dir: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		styleID := entry.Name()
		styleDir := filepath.Join(dir, styleID)

		// 1. Read style.yaml
		yamlPath := filepath.Join(styleDir, "style.yaml")
		yamlData, err := os.ReadFile(yamlPath)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", yamlPath, err)
		}
		var def externalStyleDef
		if err := yaml.Unmarshal(yamlData, &def); err != nil {
			return fmt.Errorf("failed to parse %s: %w", yamlPath, err)
		}
		if def.Name == "" || def.Description == "" {
			return fmt.Errorf("invalid style.yaml for %s: name and description required", styleID)
		}

		// 2. Read template draw.md.tmpl
		tmplPath := filepath.Join(styleDir, "draw.md.tmpl")
		tmplData, err := os.ReadFile(tmplPath)
		if err != nil {
			return fmt.Errorf("failed to read %s: %w", tmplPath, err)
		}

		templateKey := styleID
		templateName := templateKey + ".md.tmpl"
		
		// Add template to engine
		if _, err := e.templates.New(templateName).Parse(string(tmplData)); err != nil {
			return fmt.Errorf("failed to parse template %s: %w", tmplPath, err)
		}

		// 3. Register style metadata
		comicStyle := domain.ComicStyle(styleID)
		domain.StyleRegistry[comicStyle] = domain.StyleMeta{
			ID:          comicStyle,
			Name:        def.Name,
			Description: def.Description,
			TemplateKey: templateKey,
		}
	}

	return nil
}
