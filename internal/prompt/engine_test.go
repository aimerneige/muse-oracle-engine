package prompt

import (
	"strings"
	"testing"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
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

func TestRenderLongMangaPromptsUseSeparateJSONFlow(t *testing.T) {
	t.Parallel()

	engine, err := NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	character := domain.Character{
		ID:          "honoka",
		Name:        "高坂穗乃果",
		NameEN:      "Kousaka Honoka",
		Series:      "lovelive",
		Personality: "开朗元气",
	}

	outline, err := engine.RenderLongMangaOutline(LongMangaOutlineData{
		Characters: []domain.Character{character},
		PlotHint:   "长篇连续剧情",
	})
	if err != nil {
		t.Fatalf("RenderLongMangaOutline returned error: %v", err)
	}
	if !strings.Contains(outline, "自动化长篇漫画剧情梗概引擎") {
		t.Fatal("expected long manga outline prompt role")
	}
	if !strings.Contains(outline, "`lovelive/honoka`") {
		t.Fatal("expected long manga outline prompt to expose stable character ID")
	}
	if !strings.Contains(outline, "只输出 JSON 代码块") {
		t.Fatal("expected long manga outline prompt to require JSON output")
	}

	episode, err := engine.RenderLongMangaEpisode(LongMangaEpisodeData{
		Characters: []domain.Character{character},
		FullOutline: domain.LongMangaOutline{
			TotalEpisodes: 1,
			Episodes: []domain.LongMangaEpisodeOutline{
				{Episode: 1, Title: "晨间约定", Summary: "确认计划", CharacterIDs: []string{"lovelive/honoka"}},
			},
		},
		Episode: domain.LongMangaEpisodeOutline{
			Episode:      1,
			Title:        "晨间约定",
			Summary:      "确认计划",
			CharacterIDs: []string{"lovelive/honoka"},
		},
		StyleDescription: "水彩画风格",
	})
	if err != nil {
		t.Fatalf("RenderLongMangaEpisode returned error: %v", err)
	}
	if !strings.Contains(episode, "自动化长篇漫画单话分镜脚本引擎") {
		t.Fatal("expected long manga episode prompt role")
	}
	if !strings.Contains(episode, "每一格返回实际出现或明确需要引用的角色 ID") {
		t.Fatal("expected long manga episode prompt to require per-panel character IDs")
	}
}
