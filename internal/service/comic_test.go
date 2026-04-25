package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
)

func TestBuildImageStateInitializesDefaults(t *testing.T) {
	t.Parallel()

	panels := []domain.StoryboardPanel{{Index: 1}, {Index: 2}}

	got := buildImageState(panels, nil)

	if len(got) != 2 {
		t.Fatalf("expected 2 image slots, got %d", len(got))
	}
	if got[0].Index != 1 || got[1].Index != 2 {
		t.Fatalf("unexpected indexes: %+v", got)
	}
	if got[0].Status != "pending" || got[1].Status != "pending" {
		t.Fatalf("expected pending status, got %+v", got)
	}
	if got[0].Attempt != 1 || got[1].Attempt != 1 {
		t.Fatalf("expected attempt 1, got %+v", got)
	}
}

func TestPlanImageJobsSkipsCompletedImages(t *testing.T) {
	t.Parallel()

	panels := []domain.StoryboardPanel{
		{Index: 1, Content: "a"},
		{Index: 2, Content: "b"},
		{Index: 3, Content: "c"},
	}
	images := []domain.ImageResult{
		{Index: 1, Status: "done", Attempt: 1},
		{Index: 2, Status: "failed", Attempt: 2},
		{Index: 3, Status: "pending", Attempt: 1},
	}

	jobs := planImageJobs(panels, images)

	if len(jobs) != 2 {
		t.Fatalf("expected 2 jobs, got %d", len(jobs))
	}
	if jobs[0].slot != 1 || jobs[0].panel.Index != 2 || jobs[0].attempt != 2 {
		t.Fatalf("unexpected first job: %+v", jobs[0])
	}
	if jobs[1].slot != 2 || jobs[1].panel.Index != 3 || jobs[1].attempt != 1 {
		t.Fatalf("unexpected second job: %+v", jobs[1])
	}
}

func TestMergeImageResultsReplacesOnlyTargetSlots(t *testing.T) {
	t.Parallel()

	initial := []domain.ImageResult{
		{Index: 1, Status: "pending", Attempt: 1},
		{Index: 2, Status: "pending", Attempt: 1},
	}
	results := []imageJobResult{
		{slot: 1, image: domain.ImageResult{Index: 2, Status: "done", Attempt: 1, FilePath: "images/002.png"}},
	}

	got := mergeImageResults(initial, results)

	if got[0].Status != "pending" {
		t.Fatalf("expected first slot unchanged, got %+v", got[0])
	}
	if got[1].Status != "done" || got[1].FilePath != "images/002.png" {
		t.Fatalf("expected second slot updated, got %+v", got[1])
	}
}

func TestProjectStatusFromImages(t *testing.T) {
	t.Parallel()

	if status := projectStatusFromImages(nil); status != domain.StatusReviewApproved {
		t.Fatalf("expected review_approved for empty images, got %s", status)
	}

	done := []domain.ImageResult{
		{Index: 1, Status: "done", Attempt: 1},
		{Index: 2, Status: "done", Attempt: 1},
	}
	if status := projectStatusFromImages(done); status != domain.StatusImagesDone {
		t.Fatalf("expected images_done, got %s", status)
	}

	mixed := []domain.ImageResult{
		{Index: 1, Status: "done", Attempt: 1},
		{Index: 2, Status: "failed", Attempt: 1},
	}
	if status := projectStatusFromImages(mixed); status != domain.StatusReviewApproved {
		t.Fatalf("expected review_approved, got %s", status)
	}
}

func TestGenerateSingleImageUpdatesStatusAndResult(t *testing.T) {
	t.Parallel()

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	store := &stubStore{imagePath: filepath.Join("images", "001.png")}
	svc := NewComicService(&stubImageProvider{data: []byte("png")}, engine, store)
	project := testProject()

	if err := svc.GenerateSingleImage(context.Background(), project, 1); err != nil {
		t.Fatalf("GenerateSingleImage returned error: %v", err)
	}

	if project.Images[0].Status != "done" {
		t.Fatalf("expected image status done, got %+v", project.Images[0])
	}
	if project.Images[0].FilePath != filepath.Join("images", "001.png") {
		t.Fatalf("expected saved file path, got %+v", project.Images[0])
	}
	if project.Status != domain.StatusImagesDone {
		t.Fatalf("expected project status images_done, got %s", project.Status)
	}
}

func TestGenerateAllImagesKeepsProjectRetryableOnPartialFailure(t *testing.T) {
	t.Parallel()

	engine, err := prompt.NewEngine()
	if err != nil {
		t.Fatalf("failed to create prompt engine: %v", err)
	}

	svc := NewComicService(&stubImageProvider{err: errors.New("boom")}, engine, &stubStore{})
	project := testProject()

	err = svc.GenerateAllImages(context.Background(), project)
	if err == nil {
		t.Fatal("expected partial failure error")
	}

	if project.Status != domain.StatusReviewApproved {
		t.Fatalf("expected project to remain retryable, got %s", project.Status)
	}
	if len(project.Images) != 1 || project.Images[0].Status != "failed" {
		t.Fatalf("expected failed image result, got %+v", project.Images)
	}
}

type stubImageProvider struct {
	data []byte
	err  error
}

func (s *stubImageProvider) GenerateImage(context.Context, string) ([]byte, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.data, nil
}

func (s *stubImageProvider) Name() string { return "stub" }

type stubStore struct {
	imagePath string
}

func (s *stubStore) Save(*domain.Project) error           { return nil }
func (s *stubStore) Load(string) (*domain.Project, error) { return nil, nil }
func (s *stubStore) Delete(string) error                  { return nil }
func (s *stubStore) List() ([]string, error)              { return nil, nil }
func (s *stubStore) SaveImage(_ string, index int, _ int, _ []byte) (string, error) {
	if s.imagePath != "" {
		return s.imagePath, nil
	}
	return filepath.Join("images", "001.png"), nil
}
func (s *stubStore) SavePrompt(string, int, int, string) (string, error) {
	return filepath.Join("prompts", "001.txt"), nil
}
func (s *stubStore) LoadImage(string, int) ([]byte, error)          { return nil, nil }
func (s *stubStore) LoadImageByPath(string, string) ([]byte, error) { return nil, nil }
func (s *stubStore) ProjectDir(string) string                       { return "" }

func testProject() *domain.Project {
	return &domain.Project{
		ID:     "project-1",
		Status: domain.StatusReviewApproved,
		Characters: []domain.Character{
			{Name: "Test"},
		},
		Style: domain.ComicStyle("watercolor"),
		StoryResult: &domain.StoryResult{
			CharacterSetting: "setting",
		},
		Storyboard: &domain.Storyboard{
			Panels: []domain.StoryboardPanel{
				{Index: 1, Content: "panel"},
			},
		},
	}
}
