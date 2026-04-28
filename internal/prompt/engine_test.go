package prompt

import (
	"strings"
	"testing"
)

func TestRenderStorybookIncludesStyleDescription(t *testing.T) {
	t.Parallel()

	engine, err := NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	description := "水彩画风格，柔和色调与纸张质感"
	got, err := engine.RenderStorybook(StorybookData{
		StyleDescription: description,
		PlotHint:         "温馨日常",
	})
	if err != nil {
		t.Fatalf("RenderStorybook returned error: %v", err)
	}

	if !strings.Contains(got, "## 画风设计参考：") {
		t.Fatal("expected storybook prompt to contain style reference section")
	}
	if !strings.Contains(got, description) {
		t.Fatalf("expected storybook prompt to contain style description %q", description)
	}
}
