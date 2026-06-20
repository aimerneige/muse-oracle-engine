package service

import (
	"context"
	"fmt"
	"strings"
	"sync"
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

	store := &stubLongMangaProgressStore{}
	state, err := svc.GenerateOutlineWithStore(context.Background(), testLongMangaProject(), store)
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
	if _, ok := store.prompts["long_outline_prompt"]; !ok {
		t.Fatalf("expected outline prompt to be saved, got %+v", store.prompts)
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

func TestSelectFourPanelStoriesKeepsRequestedCandidates(t *testing.T) {
	t.Parallel()

	selected, err := SelectFourPanelStories(domain.LongMangaOutline{
		TotalEpisodes: 4,
		Episodes: []domain.LongMangaEpisodeOutline{
			{Episode: 1, Title: "一", Summary: "起承转合"},
			{Episode: 2, Title: "二", Summary: "起承转合"},
			{Episode: 3, Title: "三", Summary: "起承转合"},
			{Episode: 4, Title: "四", Summary: "起承转合"},
		},
	}, []int{1, 3, 4})
	if err != nil {
		t.Fatalf("SelectFourPanelStories returned error: %v", err)
	}
	if selected.TotalEpisodes != 3 || len(selected.Episodes) != 3 {
		t.Fatalf("expected three selected stories, got %+v", selected)
	}
	if selected.Episodes[0].Episode != 1 || selected.Episodes[1].Episode != 3 || selected.Episodes[2].Episode != 4 {
		t.Fatalf("expected stories 1, 3, 4, got %+v", selected.Episodes)
	}
}

func TestSelectFourPanelStoriesRejectsUnavailableCandidate(t *testing.T) {
	t.Parallel()

	_, err := SelectFourPanelStories(domain.LongMangaOutline{
		TotalEpisodes: 1,
		Episodes:      []domain.LongMangaEpisodeOutline{{Episode: 1, Title: "一", Summary: "起承转合"}},
	}, []int{2})
	if err == nil || !strings.Contains(err.Error(), "story 2 is not available") {
		t.Fatalf("expected unavailable story error, got %v", err)
	}
}

func TestGenerateFourPanelStoriesRejectsNonFourPanelResponse(t *testing.T) {
	t.Parallel()

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}
	provider := &stubLLMProvider{
		response: "```json\n{\"episode\":1,\"title\":\"晨间约定\",\"summary\":\"起承转合\",\"character_ids\":[\"lovelive/honoka\"],\"panels\":[{\"index\":1,\"character_ids\":[\"lovelive/honoka\"],\"content\":\"第一格\"}]}\n```",
	}
	state := &domain.LongMangaState{
		ProjectID: "project-1",
		CandidateCharacters: []domain.LongMangaCharacterRef{
			{ID: "lovelive/honoka", Name: "高坂穗乃果", Series: "lovelive"},
		},
		ConfirmedOutline: &domain.LongMangaOutline{
			TotalEpisodes: 1,
			Episodes: []domain.LongMangaEpisodeOutline{
				{Episode: 1, Title: "晨间约定", Summary: "起承转合", CharacterIDs: []string{"lovelive/honoka"}},
			},
		},
	}

	err = NewLongMangaService(provider, engine).GenerateAllFourPanelStories(context.Background(), testLongMangaProject(), state, nil)
	if err != nil {
		t.Fatalf("GenerateAllFourPanelStories returned error: %v", err)
	}
	if state.Status != domain.LongMangaStatusStoryboardPartial || !strings.Contains(state.Error, "exactly 4 panels") {
		t.Fatalf("expected non-four-panel response to be retained as partial failure, got status=%s error=%q", state.Status, state.Error)
	}
}

func TestValidateFourPanelScriptRejectsStoryboardSubtitles(t *testing.T) {
	t.Parallel()

	script := domain.LongMangaEpisodeScript{
		Episode: 1,
		Panels: []domain.LongMangaPanelScript{
			{Index: 1, Content: "* **【构图与景别】**：中景"},
			{Index: 2, Content: "* **【构图与景别】**：近景"},
			{Index: 3, Content: "* **【构图与景别】**：特写"},
			{Index: 4, Content: "* **【构图与景别】**：全景"},
		},
	}
	if err := validateFourPanelScript(script); err != nil {
		t.Fatalf("expected strict four-panel script to pass, got %v", err)
	}

	script.Panels[3].Content = "##### 第4格【合】\n* **【构图与景别】**：全景"
	if err := validateFourPanelScript(script); err == nil || !strings.Contains(err.Error(), "must not contain storyboard subtitles") {
		t.Fatalf("expected storyboard subtitle to fail, got %v", err)
	}
}

func TestApplyFourPanelMangaStateToProjectRemovesStoryboardSubtitles(t *testing.T) {
	t.Parallel()

	project := testLongMangaProject()
	state := &domain.LongMangaState{
		ConfirmedOutline: &domain.LongMangaOutline{
			TotalEpisodes: 1,
			Episodes:      []domain.LongMangaEpisodeOutline{{Episode: 1, Title: "晨间约定", Summary: "起承转合"}},
		},
		Episodes: []domain.LongMangaEpisodeScript{{
			Episode: 1,
			Panels: []domain.LongMangaPanelScript{
				{Index: 1, Content: "##### 第1格【起】\n* **【构图与景别】**：中景"},
				{Index: 2, Content: "##### 第2格【承】\n* **【构图与景别】**：近景"},
				{Index: 3, Content: "##### 第3格【转】\n* **【构图与景别】**：特写"},
				{Index: 4, Content: "##### 第4格【合】\n* **【构图与景别】**：全景"},
			},
		}},
	}

	if err := ApplyFourPanelMangaStateToProject(project, state); err != nil {
		t.Fatalf("ApplyFourPanelMangaStateToProject returned error: %v", err)
	}
	content := project.Storyboard.Panels[0].Content
	for _, forbidden := range []string{"#", "第1格", "第 1 话", "【起】", "【承】", "【转】", "【合】", "起承转合"} {
		if strings.Contains(content, forbidden) {
			t.Fatalf("expected title-free four-panel content, found %q in %s", forbidden, content)
		}
	}
	if strings.Count(content, "【构图与景别】") != 4 {
		t.Fatalf("expected all four panel descriptions to remain, got %s", content)
	}

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}
	drawPrompt, err := engine.RenderComicDraw(project.Style, prompt.ComicDrawData{
		PanelContent: content,
		Language:     project.Language,
	})
	if err != nil {
		t.Fatalf("failed to render comic draw prompt: %v", err)
	}
	parts := strings.SplitN(drawPrompt, "## 分镜脚本：", 2)
	if len(parts) != 2 {
		t.Fatalf("comic draw prompt missing storyboard section")
	}
	for _, forbidden := range []string{"#####", "第1格", "【起】", "【承】", "【转】", "【合】", "起承转合"} {
		if strings.Contains(parts[1], forbidden) {
			t.Fatalf("comic draw storyboard contains forbidden subtitle %q: %s", forbidden, parts[1])
		}
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
				Episode:      1,
				Title:        "晨间约定",
				Summary:      "确认计划",
				CharacterIDs: []string{"lovelive/honoka"},
				Panels: []domain.LongMangaPanelScript{
					{Index: 1, CharacterIDs: []string{"lovelive/honoka"}, Content: "##### 第1格"},
					{Index: 2, CharacterIDs: []string{"lovelive/honoka"}, Content: "##### 第2格"},
					{Index: 3, CharacterIDs: []string{"lovelive/honoka"}, Content: "##### 第3格"},
					{Index: 4, CharacterIDs: []string{"lovelive/honoka"}, Content: "##### 第4格"},
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
	if strings.Contains(panel.Content, "晨间约定") {
		t.Fatalf("expected episode title to be omitted from storyboard panel content, got %s", panel.Content)
	}
	if !strings.Contains(panel.Content, "#### 【第 1 话】") {
		t.Fatalf("expected episode marker to be kept in storyboard panel content, got %s", panel.Content)
	}
	if !strings.Contains(panel.Content, "##### 第1格") || !strings.Contains(panel.Content, "##### 第4格") {
		t.Fatalf("expected one storyboard panel to contain the full four-panel episode, got %s", panel.Content)
	}
	if project.Status != domain.StatusStoryboardDone {
		t.Fatalf("expected storyboard_done status, got %s", project.Status)
	}
}

func TestGenerateAllLongMangaEpisodesContinuesAfterFailureAndSavesProgress(t *testing.T) {
	t.Parallel()

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	project := testLongMangaProject()
	state := testConfirmedLongMangaState()
	store := &stubLongMangaProgressStore{}
	svc := NewLongMangaService(&episodeStubLLMProvider{}, engine)

	err = svc.GenerateAllEpisodes(context.Background(), project, state, store)
	if err != nil {
		t.Fatalf("GenerateAllEpisodes returned error: %v", err)
	}

	if len(state.Episodes) != 2 {
		t.Fatalf("expected successful episodes to be retained, got %+v", state.Episodes)
	}
	if state.Episodes[0].Episode != 1 || state.Episodes[1].Episode != 3 {
		t.Fatalf("expected episodes 1 and 3 to be retained, got %+v", state.Episodes)
	}
	if state.Status != domain.LongMangaStatusStoryboardPartial {
		t.Fatalf("expected partial status after episode failure, got %s", state.Status)
	}
	if !strings.Contains(state.Error, "episode 2") {
		t.Fatalf("expected episode 2 in state error, got %q", state.Error)
	}
	if len(store.scripts) != 2 {
		t.Fatalf("expected successful episode scripts to be saved, got %d", len(store.scripts))
	}
	if _, ok := store.failures[2]; !ok {
		t.Fatalf("expected failed episode placeholder to be saved, got %+v", store.failures)
	}
	if store.saveCount < 2 {
		t.Fatalf("expected state saved after progress and failure, got %d saves", store.saveCount)
	}
	if len(store.prompts) != 3 {
		t.Fatalf("expected all episode prompts to be saved, got %+v", store.prompts)
	}
}

func TestGenerateAllLongMangaEpisodesCarriesCostumeStateForward(t *testing.T) {
	t.Parallel()

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	project := testLongMangaProject()
	state := &domain.LongMangaState{
		ProjectID: "project-1",
		Status:    domain.LongMangaStatusOutlineConfirmed,
		CandidateCharacters: []domain.LongMangaCharacterRef{
			{ID: "lovelive/honoka", Name: "高坂穗乃果", Series: "lovelive"},
		},
		ConfirmedOutline: &domain.LongMangaOutline{
			TotalEpisodes: 2,
			Episodes: []domain.LongMangaEpisodeOutline{
				{Episode: 1, Title: "第1话", Summary: "雨中集合", CharacterIDs: []string{"lovelive/honoka"}},
				{Episode: 2, Title: "第2话", Summary: "继续前进", CharacterIDs: []string{"lovelive/honoka"}},
			},
		},
	}
	provider := &costumeContinuityStubLLMProvider{}
	svc := NewLongMangaService(provider, engine)

	if err := svc.GenerateAllEpisodes(context.Background(), project, state, nil); err != nil {
		t.Fatalf("GenerateAllEpisodes returned error: %v", err)
	}

	if provider.calls != 2 {
		t.Fatalf("expected two sequential LLM calls, got %d", provider.calls)
	}
	if len(state.CharacterCostumes) != 1 {
		t.Fatalf("expected one carried costume state, got %+v", state.CharacterCostumes)
	}
	if state.CharacterCostumes[0].Outfit != "雨水打湿的深蓝校服外套、白衬衫、红色领结、格子裙、书包" {
		t.Fatalf("expected latest costume state to be retained, got %+v", state.CharacterCostumes[0])
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

type episodeStubLLMProvider struct{}

func (s *episodeStubLLMProvider) GenerateText(_ context.Context, prompt string) (string, error) {
	if strings.Contains(prompt, `"episode": 2`) {
		return "```json\n{\"not\":\"an episode\"}\n```", nil
	}
	episode := 1
	if strings.Contains(prompt, `"episode": 3`) {
		episode = 3
	}
	return fmt.Sprintf("```json\n{\"episode\":%d,\"title\":\"第%d话\",\"summary\":\"确认计划\",\"character_ids\":[\"lovelive/honoka\"],\"panels\":[{\"index\":1,\"character_ids\":[\"lovelive/honoka\"],\"content\":\"##### 第1格\"}],\"costume_states\":[{\"character_id\":\"lovelive/honoka\",\"outfit\":\"整洁校服与书包\",\"update_reason\":\"延续上一话\"}]}\n```", episode, episode), nil
}

func (s *episodeStubLLMProvider) GenerateTextWithHistory(context.Context, llm.History) (string, error) {
	return "", nil
}

func (s *episodeStubLLMProvider) Name() string {
	return "episode-stub"
}

type costumeContinuityStubLLMProvider struct {
	calls int
}

func (s *costumeContinuityStubLLMProvider) GenerateText(_ context.Context, prompt string) (string, error) {
	s.calls++
	if s.calls == 2 && !strings.Contains(prompt, "雨水打湿的深蓝校服外套") {
		return "", fmt.Errorf("second episode prompt did not include previous costume state")
	}
	return fmt.Sprintf("```json\n{\"episode\":%d,\"title\":\"第%d话\",\"summary\":\"确认计划\",\"character_ids\":[\"lovelive/honoka\"],\"panels\":[{\"index\":1,\"character_ids\":[\"lovelive/honoka\"],\"content\":\"##### 第1格\"}],\"costume_states\":[{\"character_id\":\"lovelive/honoka\",\"outfit\":\"雨水打湿的深蓝校服外套、白衬衫、红色领结、格子裙、书包\",\"update_reason\":\"第1格剧情触发\"}]}\n```", s.calls, s.calls), nil
}

func (s *costumeContinuityStubLLMProvider) GenerateTextWithHistory(context.Context, llm.History) (string, error) {
	return "", nil
}

func (s *costumeContinuityStubLLMProvider) Name() string {
	return "costume-continuity-stub"
}

type stubLongMangaProgressStore struct {
	mu        sync.Mutex
	scripts   map[int]domain.LongMangaEpisodeScript
	failures  map[int]domain.LongMangaEpisodeOutline
	prompts   map[string]string
	saveCount int
}

func (s *stubLongMangaProgressStore) Save(*domain.LongMangaState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saveCount++
	return nil
}

func (s *stubLongMangaProgressStore) SaveEpisodeScript(_ string, script domain.LongMangaEpisodeScript) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.scripts == nil {
		s.scripts = make(map[int]domain.LongMangaEpisodeScript)
	}
	s.scripts[script.Episode] = script
	return fmt.Sprintf("storyboards/long_episode_%03d.md", script.Episode), nil
}

func (s *stubLongMangaProgressStore) SaveEpisodeFailure(_ string, episode domain.LongMangaEpisodeOutline, _ error) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.failures == nil {
		s.failures = make(map[int]domain.LongMangaEpisodeOutline)
	}
	s.failures[episode.Episode] = episode
	return fmt.Sprintf("storyboards/long_episode_%03d.md", episode.Episode), nil
}

func (s *stubLongMangaProgressStore) SaveLongMangaPrompt(_ string, name string, prompt string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.prompts == nil {
		s.prompts = make(map[string]string)
	}
	s.prompts[name] = prompt
	return fmt.Sprintf("prompts/%s.md", name), nil
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

func testConfirmedLongMangaState() *domain.LongMangaState {
	outline := &domain.LongMangaOutline{
		TotalEpisodes: 3,
		Episodes: []domain.LongMangaEpisodeOutline{
			{Episode: 1, Title: "第1话", Summary: "确认计划", CharacterIDs: []string{"lovelive/honoka"}},
			{Episode: 2, Title: "第2话", Summary: "出现阻碍", CharacterIDs: []string{"lovelive/honoka"}},
			{Episode: 3, Title: "第3话", Summary: "重新出发", CharacterIDs: []string{"lovelive/honoka"}},
		},
	}
	return &domain.LongMangaState{
		ProjectID: "project-1",
		Status:    domain.LongMangaStatusOutlineConfirmed,
		CandidateCharacters: []domain.LongMangaCharacterRef{
			{ID: "lovelive/honoka", Name: "高坂穗乃果", Series: "lovelive"},
		},
		ConfirmedOutline: outline,
	}
}
