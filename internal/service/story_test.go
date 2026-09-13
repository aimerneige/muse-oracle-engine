package service

import (
	"strings"
	"testing"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
)

func TestBuiltInStyleDescriptionsAreValid(t *testing.T) {
	t.Parallel()

	for style, meta := range domain.StyleRegistry {
		if strings.TrimSpace(meta.Description) == "" {
			t.Fatalf("style %s has empty description", style)
		}
		if len([]rune(meta.Description)) > 100 {
			t.Fatalf("style %s description is longer than 100 characters", style)
		}
	}
}

func TestParseStoryboardFlattensEpisodesIntoPanels(t *testing.T) {
	t.Parallel()

	response := "```json\n" + `{
  "episodes": [
    {
      "episode": 1,
      "title": "清晨的走廊",
      "summary": "穗乃果踩着点冲进教室。",
      "character_ids": ["lovelive/honoka"],
      "panels": [
        {"index": 1, "content": "##### 第1格\n走廊"},
        {"index": 2, "content": "##### 第2格\n教室门"},
        {"index": 3, "content": "##### 第3格\n喘息"},
        {"index": 4, "content": "##### 第4格\n坐下"}
      ]
    },
    {
      "episode": 2,
      "title": "天台的面包",
      "summary": "两人在天台分面包。",
      "character_ids": ["lovelive/honoka", "lovelive/umi"],
      "panels": [
        {"index": 1, "content": "##### 第1格\n天台"},
        {"index": 2, "content": "##### 第2格\n面包"},
        {"index": 3, "content": "##### 第3格\n对视"},
        {"index": 4, "content": "##### 第4格\n微笑"}
      ]
    }
  ]
}` + "\n```"

	panels, err := parseStoryboard(response, map[string]struct{}{
		"lovelive/honoka": {},
		"lovelive/umi":    {},
	})
	if err != nil {
		t.Fatalf("parseStoryboard returned error: %v", err)
	}
	if len(panels) != 2 {
		t.Fatalf("expected 2 panels, got %d", len(panels))
	}
	if panels[0].Index != 1 || panels[1].Index != 2 {
		t.Fatalf("expected sequential panel indexes, got %d and %d", panels[0].Index, panels[1].Index)
	}
	if !strings.Contains(panels[1].Content, "#### 【第 2 话】") {
		t.Fatalf("expected panel content to carry episode header, got %q", panels[1].Content)
	}
	if !strings.Contains(panels[1].Content, "**梗概**：两人在天台分面包。") {
		t.Fatalf("expected panel content to carry episode summary, got %q", panels[1].Content)
	}
	if !strings.Contains(panels[1].Content, "##### 第1格\n天台") {
		t.Fatalf("expected panel content to keep panel order, got %q", panels[1].Content)
	}
	if len(panels[1].CharacterIDs) != 2 {
		t.Fatalf("expected panel to keep episode character ids, got %v", panels[1].CharacterIDs)
	}
}

func TestParseStoryboardRejectsEpisodeWithoutFourPanels(t *testing.T) {
	t.Parallel()

	response := `{"episodes":[{"episode":1,"title":"清晨的走廊","character_ids":[],"panels":[{"index":1,"content":"##### 第1格\n走廊"}]}]}`

	if _, err := parseStoryboard(response, map[string]struct{}{}); err == nil {
		t.Fatal("expected parseStoryboard to reject an episode without four panels")
	}
}

func TestParseStoryboardRejectsUnknownCharacter(t *testing.T) {
	t.Parallel()

	response := `{"episodes":[{"episode":1,"title":"清晨的走廊","character_ids":["lovelive/unknown"],"panels":[{"index":1,"content":"a"},{"index":2,"content":"b"},{"index":3,"content":"c"},{"index":4,"content":"d"}]}]}`

	if _, err := parseStoryboard(response, map[string]struct{}{"lovelive/honoka": {}}); err == nil {
		t.Fatal("expected parseStoryboard to reject an unknown character id")
	}
}

func TestBuildCharacterSettingUsesSinglePhysicalTraitNote(t *testing.T) {
	t.Parallel()

	got := buildCharacterSetting([]domain.Character{
		{
			Name: "测试角色",
			Appearance: domain.CharacterAppearance{
				HairStyle: "短发",
				HairColor: "黑色",
				EyeShape:  "圆眼",
				EyeColor:  "棕色",
				Height:    "160cm",
				BodyType:  "标准",
				Other:     "无",
			},
		},
	})

	if !strings.HasPrefix(got, "> 注：此处设定不可变的生理特征，后续分镜中不再赘述\n") {
		t.Fatalf("expected character setting to start with note, got %q", got)
	}
	if strings.Contains(got, "### 全局固有生理特征设定") {
		t.Fatalf("expected no repeated global heading, got %q", got)
	}
}
