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

func TestRenderStorybookIncludesDialogueLanguage(t *testing.T) {
	t.Parallel()

	engine, err := NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	got, err := engine.RenderStorybook(StorybookData{
		Language: "English",
	})
	if err != nil {
		t.Fatalf("RenderStorybook returned error: %v", err)
	}

	if !strings.Contains(got, "## 对白气泡语言：") {
		t.Fatal("expected storybook prompt to contain dialogue language section")
	}
	if !strings.Contains(got, "只有对白气泡中的台词内容使用 English") {
		t.Fatal("expected storybook prompt to scope language to speech bubble dialogue")
	}
	if !strings.Contains(got, "漫符与特效声必须固定使用日语片假名 SFX") {
		t.Fatal("expected storybook prompt to keep manga symbols as Japanese katakana SFX")
	}
}

func TestRenderStorybookDefaultsDialogueLanguageToChinese(t *testing.T) {
	t.Parallel()

	engine, err := NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	got, err := engine.RenderStorybook(StorybookData{})
	if err != nil {
		t.Fatalf("RenderStorybook returned error: %v", err)
	}

	if !strings.Contains(got, "只有对白气泡中的台词内容使用 中文") {
		t.Fatal("expected empty language to default to Chinese")
	}
}

func TestRenderComicDrawIncludesDialogueLanguage(t *testing.T) {
	t.Parallel()

	engine, err := NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	got, err := engine.RenderComicDraw("watercolor", ComicDrawData{
		Language: "English",
	})
	if err != nil {
		t.Fatalf("RenderComicDraw returned error: %v", err)
	}

	if !strings.Contains(got, "气泡内文字必须使用 English") {
		t.Fatal("expected comic draw prompt to use configured dialogue language")
	}
	if !strings.Contains(got, "拟声词 (SFX) 保持为日语片假名") {
		t.Fatal("expected comic draw prompt to keep SFX as Japanese katakana")
	}
}
