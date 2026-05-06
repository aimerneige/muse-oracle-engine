package service

import (
	"strings"
	"testing"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
)

func TestStoryboardStyleDescriptionRejectsMissingDescription(t *testing.T) {
	style := domain.ComicStyle("test_missing_description")
	domain.StyleRegistry[style] = domain.StyleMeta{
		ID:          style,
		Name:        "Missing Description",
		Description: " ",
		TemplateKey: "test_missing_description",
	}
	defer delete(domain.StyleRegistry, style)

	_, err := storyboardStyleDescription(style)
	if err == nil {
		t.Fatal("expected missing description error")
	}
	if !strings.Contains(err.Error(), "missing description") {
		t.Fatalf("expected missing description error, got %v", err)
	}
}

func TestStoryboardStyleDescriptionRejectsLongDescription(t *testing.T) {
	style := domain.ComicStyle("test_long_description")
	domain.StyleRegistry[style] = domain.StyleMeta{
		ID:          style,
		Name:        "Long Description",
		Description: strings.Repeat("风", 101),
		TemplateKey: "test_long_description",
	}
	defer delete(domain.StyleRegistry, style)

	_, err := storyboardStyleDescription(style)
	if err == nil {
		t.Fatal("expected long description error")
	}
	if !strings.Contains(err.Error(), "100 characters or fewer") {
		t.Fatalf("expected length error, got %v", err)
	}
}

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
