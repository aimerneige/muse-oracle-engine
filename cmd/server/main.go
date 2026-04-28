package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"

	"github.com/aimerneige/muse-oracle-engine/internal/chardb"
	"github.com/aimerneige/muse-oracle-engine/internal/config"
	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/image"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/llm"
	"github.com/aimerneige/muse-oracle-engine/internal/service"
	"github.com/aimerneige/muse-oracle-engine/internal/storage"
	"github.com/aimerneige/muse-oracle-engine/ui"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

// App holds the server dependencies.
type App struct {
	charRegistry *chardb.Registry
	storySvc     *service.StoryService
	comicSvc     *service.ComicService
	store        storage.Store
}

func main() {
	log.Println("=== Manga Generator API Server ===")

	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found, using environment variables")
	}

	cfg := config.LoadFromEnv()
	if cfg.MockMode {
		log.Println("*** MOCK MODE ENABLED - AI calls will return fake data ***")
	}
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	// Initialize dependencies
	charRegistry, err := chardb.NewEmbeddedRegistry()
	if err != nil {
		log.Fatalf("Failed to load character database: %v", err)
	}
	// Load user-defined characters from external directory (if configured)
	if cfg.CharDBDir != "" {
		if err := charRegistry.LoadExternalDir(cfg.CharDBDir); err != nil {
			log.Printf("Warning: failed to load external characters: %v", err)
		}
	}

	promptEngine, err := prompt.NewEngine()
	if err != nil {
		log.Fatalf("Failed to initialize prompt engine: %v", err)
	}
	if cfg.StylesDir != "" {
		if err := promptEngine.LoadExternalDir(cfg.StylesDir); err != nil {
			log.Printf("Warning: failed to load external styles: %v", err)
		}
	}

	llmProvider, err := createLLMProvider(cfg)
	if err != nil {
		log.Fatalf("Failed to create LLM provider: %v", err)
	}

	imgProvider, err := createImageProvider(cfg)
	if err != nil {
		log.Fatalf("Failed to create image provider: %v", err)
	}

	store, err := storage.NewFileStore(cfg.DataDir)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}

	app := &App{
		charRegistry: charRegistry,
		storySvc:     service.NewStoryService(llmProvider, promptEngine),
		comicSvc:     service.NewComicService(imgProvider, promptEngine, store),
		store:        store,
	}

	// Register routes
	mux := http.NewServeMux()

	// Character & style queries
	mux.HandleFunc("GET /api/v1/characters", app.handleListCharacters)
	mux.HandleFunc("GET /api/v1/characters/{series}", app.handleListCharactersBySeries)
	mux.HandleFunc("GET /api/v1/styles", app.handleListStyles)

	// Project lifecycle
	mux.HandleFunc("GET /api/v1/projects", app.handleListProjects)
	mux.HandleFunc("POST /api/v1/projects", app.handleCreateProject)
	mux.HandleFunc("GET /api/v1/projects/{id}", app.handleGetProject)
	mux.HandleFunc("DELETE /api/v1/projects/{id}", app.handleDeleteProject)

	// Generation flow
	mux.HandleFunc("POST /api/v1/projects/{id}/generate/story", app.handleGenerateStory)
	mux.HandleFunc("POST /api/v1/projects/{id}/generate/storyboard", app.handleGenerateStoryboard)
	mux.HandleFunc("POST /api/v1/projects/{id}/review", app.handleReview)
	mux.HandleFunc("POST /api/v1/projects/{id}/generate/images", app.handleGenerateImages)

	// Retry
	mux.HandleFunc("POST /api/v1/projects/{id}/retry/{step}", app.handleRetryStep)
	mux.HandleFunc("POST /api/v1/projects/{id}/images/{index}/retry", app.handleRetryImage)

	// Image retrieval
	mux.HandleFunc("GET /api/v1/projects/{id}/images/{index}", app.handleGetImage)

	// Serve Static Frontend UI
	staticFS, err := fs.Sub(ui.Files, "dist")
	if err != nil {
		log.Fatalf("Failed to initialize static files: %v", err)
	}
	mux.Handle("/", http.FileServer(http.FS(staticFS)))

	log.Printf("Server starting on %s", cfg.ServerAddr)
	if err := http.ListenAndServe(cfg.ServerAddr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// --- Handlers ---

func (app *App) handleListCharacters(w http.ResponseWriter, r *http.Request) {
	type seriesWithChars struct {
		Series     domain.Series      `json:"series"`
		Characters []domain.Character `json:"characters"`
	}

	var result []seriesWithChars
	for _, s := range app.charRegistry.ListSeries() {
		result = append(result, seriesWithChars{
			Series:     s,
			Characters: app.charRegistry.ListCharacters(s.ID),
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (app *App) handleListCharactersBySeries(w http.ResponseWriter, r *http.Request) {
	series := r.PathValue("series")
	chars := app.charRegistry.ListCharacters(series)
	writeJSON(w, http.StatusOK, chars)
}

func (app *App) handleListStyles(w http.ResponseWriter, _ *http.Request) {
	var styles []domain.StyleMeta
	for _, s := range domain.StyleRegistry {
		styles = append(styles, s)
	}
	writeJSON(w, http.StatusOK, styles)
}

func (app *App) handleCreateProject(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Characters []string          `json:"characters"` // e.g. ["lovelive/honoka", "lovelive/umi"]
		PlotHint   string            `json:"plot_hint"`
		Style      domain.ComicStyle `json:"style"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate & resolve characters
	var chars []domain.Character
	for _, id := range req.Characters {
		c, ok := app.charRegistry.GetCharacter(id)
		if !ok {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("character not found: %s", id))
			return
		}
		chars = append(chars, c)
	}

	if !req.Style.IsValid() {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid style: %s", req.Style))
		return
	}

	project := &domain.Project{
		ID:         generateID(),
		Status:     domain.StatusCreated,
		Characters: chars,
		PlotHint:   req.PlotHint,
		Style:      req.Style,
	}

	if err := app.store.Save(project); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save project")
		return
	}

	writeJSON(w, http.StatusCreated, project)
}

func (app *App) handleGetProject(w http.ResponseWriter, r *http.Request) {
	project, err := app.store.Load(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, project)
}

func (app *App) handleDeleteProject(w http.ResponseWriter, r *http.Request) {
	if err := app.store.Delete(r.PathValue("id")); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (app *App) handleGenerateStory(w http.ResponseWriter, r *http.Request) {
	project, err := app.store.Load(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	// Story generation is now merged into storyboard generation.
	// This endpoint runs the full storyboard generation in one LLM call.
	if err := app.storySvc.GenerateStoryboard(r.Context(), project); err != nil {
		_ = app.store.Save(project) // save progress
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := app.store.Save(project); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, project)
}

func (app *App) handleGenerateStoryboard(w http.ResponseWriter, r *http.Request) {
	project, err := app.store.Load(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	// If storyboard is already done, return the project as-is
	if project.Status == domain.StatusStoryboardDone ||
		project.Status == domain.StatusReviewPending ||
		project.Status == domain.StatusReviewApproved ||
		project.Status == domain.StatusImagesDone {
		writeJSON(w, http.StatusOK, project)
		return
	}

	if err := app.storySvc.GenerateStoryboard(r.Context(), project); err != nil {
		_ = app.store.Save(project)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := app.store.Save(project); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, project)
}

func (app *App) handleReview(w http.ResponseWriter, r *http.Request) {
	project, err := app.store.Load(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var req struct {
		Approved bool   `json:"approved"`
		Feedback string `json:"feedback"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Approved {
		project.Status = domain.StatusReviewApproved
	} else {
		project.ReviewFeedback = req.Feedback
		project.Status = domain.StatusStoryboardDone // allow re-generation
	}

	if err := app.store.Save(project); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, project)
}

func (app *App) handleGenerateImages(w http.ResponseWriter, r *http.Request) {
	project, err := app.store.Load(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	if err := app.comicSvc.GenerateAllImages(r.Context(), project); err != nil {
		_ = app.store.Save(project)
		// Don't return error — partial success is valid
		log.Printf("Image generation had errors: %v", err)
	}

	if err := app.store.Save(project); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, project)
}

func (app *App) handleGetImage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	indexStr := r.PathValue("index")
	var index int
	if _, err := fmt.Sscanf(indexStr, "%d", &index); err != nil {
		writeError(w, http.StatusBadRequest, "invalid image index")
		return
	}

	data, err := app.store.LoadImage(id, index)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Write(data)
}

func (app *App) handleListProjects(w http.ResponseWriter, _ *http.Request) {
	ids, err := app.store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Load summary info for each project
	type projectSummary struct {
		ID     string               `json:"id"`
		Status domain.ProjectStatus `json:"status"`
		Style  domain.ComicStyle    `json:"style"`
		Plot   string               `json:"plot_hint"`
	}

	var summaries []projectSummary
	for _, id := range ids {
		p, err := app.store.Load(id)
		if err != nil {
			continue
		}
		summaries = append(summaries, projectSummary{
			ID:     p.ID,
			Status: p.Status,
			Style:  p.Style,
			Plot:   p.PlotHint,
		})
	}
	writeJSON(w, http.StatusOK, summaries)
}

func (app *App) handleRetryStep(w http.ResponseWriter, r *http.Request) {
	project, err := app.store.Load(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	step := r.PathValue("step")
	switch step {
	case "story", "generate_story", "storyboard", "generate_storyboard":
		project.ResetToStep("generate_storyboard")
		if err := app.storySvc.GenerateStoryboard(r.Context(), project); err != nil {
			_ = app.store.Save(project)
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	case "images", "generate_images":
		project.ResetToStep("generate_images")
		if err := app.comicSvc.GenerateAllImages(r.Context(), project); err != nil {
			_ = app.store.Save(project)
			log.Printf("Image generation had errors: %v", err)
		}
	default:
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unknown step: %s", step))
		return
	}

	if err := app.store.Save(project); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, project)
}

func (app *App) handleRetryImage(w http.ResponseWriter, r *http.Request) {
	project, err := app.store.Load(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	indexStr := r.PathValue("index")
	var index int
	if _, err := fmt.Sscanf(indexStr, "%d", &index); err != nil {
		writeError(w, http.StatusBadRequest, "invalid image index")
		return
	}

	project.ResetSingleImage(index)

	if err := app.comicSvc.GenerateSingleImage(r.Context(), project, index); err != nil {
		_ = app.store.Save(project)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := app.store.Save(project); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, project)
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func generateID() string {
	return uuid.New().String()
}

// --- Provider factories (shared with CLI) ---

func createLLMProvider(cfg *config.Config) (llm.Provider, error) {
	switch cfg.LLMProvider {
	case "mock":
		return llm.NewMockProvider(), nil
	case "gemini":
		model := llm.Gemini3Pro
		switch cfg.LLMModel {
		case "gemini-3.1-pro-preview":
			model = llm.Gemini3Pro
		case "gemini-3-flash-preview":
			model = llm.Gemini3Flash
		case "gemini-3.1-flash-lite-preview":
			model = llm.Gemini3FlashLite
		case "gemini-2.5-pro":
			model = llm.Gemini2Pro
		case "gemini-2.5-flash":
			model = llm.Gemini2Flash
		case "gemini-2.5-flash-lite":
			model = llm.Gemini2FlashLite
		}
		return llm.NewGeminiAdapter(cfg.GeminiAPIKey, model)
	case "deepseek":
		model := llm.DeepSeekChat
		switch cfg.LLMModel {
		case "deepseek-reasoner":
			model = llm.DeepSeekReasoner
		case "deepseek-v4-flash":
			model = llm.DeepSeekV4Flash
		case "deepseek-v4-pro":
			model = llm.DeepSeekV4Pro
		}
		return llm.NewDeepSeekAdapter(cfg.DeepSeekAPIKey, model), nil

	default:
		return nil, fmt.Errorf("unknown LLM provider: %s", cfg.LLMProvider)
	}
}

func createImageProvider(cfg *config.Config) (image.Provider, error) {
	switch cfg.ImageProvider {
	case "mock":
		return image.NewMockProvider(), nil
	case "prompt":
		return image.NewDryRunProvider(), nil
	case "gemini":
		model := image.GeminiImage31Flash
		switch cfg.ImageModel {
		case "gemini-3.1-flash-image-preview":
			model = image.GeminiImage31Flash
		case "gemini-3-pro-image-preview":
			model = image.GeminiImage3Pro
		case "gemini-2.5-flash-image":
			model = image.GeminiImage25Flash
		}
		return image.NewGeminiImageAdapter(cfg.GeminiAPIKey, model)
	case "openai":
		model := image.DALLE3
		switch cfg.ImageModel {
		case "dall-e-2":
			model = image.DALLE2
		case "dall-e-3":
			model = image.DALLE3
		}
		return image.NewOpenAIImageAdapter(cfg.OpenAIAPIKey, model), nil
	case "gpt-image":
		return image.NewGPTImageAdapter(cfg), nil

	default:
		return nil, fmt.Errorf("unknown image provider: %s", cfg.ImageProvider)
	}
}
