package prompt

import (
	"bytes"
	"embed"
	"fmt"
	"strings"
	"text/template"

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
