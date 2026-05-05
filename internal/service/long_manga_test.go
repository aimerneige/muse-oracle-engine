package service

import (
	"context"
	"strings"
	"testing"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/llm"
)

func TestGenerateLongMangaOutlineParsesAndStoresCandidateRefs(t *testing.T) {
	t.Parallel()

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	provider := &stubLLMProvider{
		response: "```json\n{\"total_episodes\":1,\"episodes\":[{\"episode\":1,\"title\":\"晨间约定\",\"summary\":\"确认计划\",\"character_ids\":[\"lovelive/honoka\"]}]}\n```",
	}
	svc := NewLongMangaService(provider, engine)

	state, err := svc.GenerateOutline(context.Background(), testLongMangaProject())
	if err != nil {
		t.Fatalf("GenerateOutline returned error: %v", err)
	}

	if state.Status != domain.LongMangaStatusOutlineGenerated {
		t.Fatalf("expected outline_generated status, got %s", state.Status)
	}
	if state.Outline == nil || state.Outline.TotalEpisodes != 1 {
		t.Fatalf("expected one outline episode, got %+v", state.Outline)
	}
	if len(state.CandidateCharacters) != 1 || state.CandidateCharacters[0].ID != "lovelive/honoka" {
		t.Fatalf("expected stable candidate character refs, got %+v", state.CandidateCharacters)
	}
}

func TestGenerateLongMangaOutlineRejectsUnknownCharacter(t *testing.T) {
	t.Parallel()

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	provider := &stubLLMProvider{
		response: "```json\n{\"total_episodes\":1,\"episodes\":[{\"episode\":1,\"title\":\"晨间约定\",\"summary\":\"确认计划\",\"character_ids\":[\"lovelive/umi\"]}]}\n```",
	}
	svc := NewLongMangaService(provider, engine)

	_, err = svc.GenerateOutline(context.Background(), testLongMangaProject())
	if err == nil {
		t.Fatal("expected unknown character error")
	}
	if !strings.Contains(err.Error(), "unknown character id lovelive/umi") {
		t.Fatalf("expected unknown character error, got %v", err)
	}
}

func TestApplyLongMangaStateToProjectCopiesPanelCharacterIDs(t *testing.T) {
	t.Parallel()

	project := testLongMangaProject()
	state := &domain.LongMangaState{
		ConfirmedOutline: &domain.LongMangaOutline{
			TotalEpisodes: 1,
			Episodes: []domain.LongMangaEpisodeOutline{
				{Episode: 1, Title: "晨间约定", Summary: "确认计划", CharacterIDs: []string{"lovelive/honoka"}},
			},
		},
		Episodes: []domain.LongMangaEpisodeScript{
			{
				Episode: 1,
				Title:   "晨间约定",
				Panels: []domain.LongMangaPanelScript{
					{Index: 1, CharacterIDs: []string{"lovelive/honoka"}, Content: "##### 第1格"},
				},
			},
		},
	}

	if err := ApplyLongMangaStateToProject(project, state); err != nil {
		t.Fatalf("ApplyLongMangaStateToProject returned error: %v", err)
	}

	if project.Storyboard == nil || len(project.Storyboard.Panels) != 1 {
		t.Fatalf("expected one storyboard panel, got %+v", project.Storyboard)
	}
	panel := project.Storyboard.Panels[0]
	if len(panel.CharacterIDs) != 1 || panel.CharacterIDs[0] != "lovelive/honoka" {
		t.Fatalf("expected panel character IDs copied, got %+v", panel.CharacterIDs)
	}
	if project.Status != domain.StatusStoryboardDone {
		t.Fatalf("expected storyboard_done status, got %s", project.Status)
	}
}

type stubLLMProvider struct {
	response string
}

func (s *stubLLMProvider) GenerateText(context.Context, string) (string, error) {
	return s.response, nil
}

func (s *stubLLMProvider) GenerateTextWithHistory(context.Context, llm.History) (string, error) {
	return s.response, nil
}

func (s *stubLLMProvider) Name() string {
	return "stub"
}

func testLongMangaProject() *domain.Project {
	return &domain.Project{
		ID:       "project-1",
		PlotHint: "长篇连续剧情",
		Style:    "watercolor",
		Language: domain.DefaultLanguage,
		Characters: []domain.Character{
			{
				ID:     "honoka",
				Name:   "高坂穗乃果",
				NameEN: "Kousaka Honoka",
				Series: "lovelive",
				Appearance: domain.CharacterAppearance{
					HairStyle: "侧马尾",
					HairColor: "橙棕色",
					EyeShape:  "大圆眼",
					EyeColor:  "蓝色",
					Height:    "157cm",
					BodyType:  "标准体型",
					Other:     "无",
				},
				Personality: "开朗元气",
			},
		},
	}
}
