package browser

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Handler provides HTTP endpoints for browser agent task management.
type Handler struct {
	queue   *Queue
	dataDir string // root data dir (for image uploads)
}

// NewHandler creates a new browser task handler.
func NewHandler(queue *Queue, dataDir string) *Handler {
	return &Handler{queue: queue, dataDir: dataDir}
}

// RegisterRoutes registers all browser agent routes on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/browser/tasks", h.handleEnqueue)
	mux.HandleFunc("GET /api/v1/browser/tasks/poll", h.handlePoll)
	mux.HandleFunc("GET /api/v1/browser/tasks", h.handleList)
	mux.HandleFunc("GET /api/v1/browser/tasks/{id}", h.handleGet)
	mux.HandleFunc("POST /api/v1/browser/tasks/{id}/complete", h.handleComplete)
	mux.HandleFunc("POST /api/v1/browser/tasks/{id}/fail", h.handleFail)
	mux.HandleFunc("POST /api/v1/browser/tasks/{id}/image", h.handleUploadImage)
	mux.HandleFunc("GET /api/v1/browser/stats", h.handleStats)
}

// --- Request/Response types ---

type enqueueRequest struct {
	Prompt string `json:"prompt"`
}

type completeRequest struct {
	FilePath string `json:"file_path"`
}

type failRequest struct {
	Error string `json:"error"`
}

// --- Handlers ---

func (h *Handler) handleEnqueue(w http.ResponseWriter, r *http.Request) {
	var req enqueueRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Prompt == "" {
		writeError(w, http.StatusBadRequest, "prompt is required")
		return
	}

	task, err := h.queue.Enqueue(req.Prompt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to enqueue: %v", err))
		return
	}
	log.Printf("[Browser] Task enqueued: id=%s", task.ID)
	writeJSON(w, http.StatusCreated, task)
}

// handlePoll returns the first pending task and atomically marks it as running.
// The browser agent calls this endpoint periodically to pick up work.
func (h *Handler) handlePoll(w http.ResponseWriter, r *http.Request) {
	log.Printf("[Browser] Poll received from %s", r.RemoteAddr)
	task := h.queue.Acquire()
	if task == nil {
		log.Printf("[Browser] Poll: no pending tasks")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	log.Printf("[Browser] Task acquired: id=%s prompt_len=%d", task.ID, len(task.Prompt))
	writeJSON(w, http.StatusOK, task)
}

func (h *Handler) handleList(w http.ResponseWriter, _ *http.Request) {
	tasks := h.queue.List()
	writeJSON(w, http.StatusOK, tasks)
}

func (h *Handler) handleGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	task, err := h.queue.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (h *Handler) handleComplete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var req completeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.FilePath = ""
	}

	if err := h.queue.Complete(id, req.FilePath); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	task, _ := h.queue.Get(id)
	log.Printf("[Browser] Task completed: id=%s path=%s", id, req.FilePath)
	writeJSON(w, http.StatusOK, task)
}

func (h *Handler) handleFail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var req failRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.Error = "unknown error"
	}

	if err := h.queue.Fail(id, req.Error); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	task, _ := h.queue.Get(id)
	log.Printf("[Browser] Task failed: id=%s error=%s", id, req.Error)
	writeJSON(w, http.StatusOK, task)
}

// handleUploadImage accepts multipart form upload of generated images.
// POST /api/v1/browser/tasks/{id}/image with multipart/form-data field "image".
// On success, auto-completes the task.
func (h *Handler) handleUploadImage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	task, err := h.queue.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if task.Status != TaskRunning {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("task status is %s, expected running", task.Status))
		return
	}

	r.ParseMultipartForm(50 << 20) // 50MB max

	file, _, err := r.FormFile("image")
	if err != nil {
		body, readErr := io.ReadAll(r.Body)
		if readErr != nil {
			writeError(w, http.StatusBadRequest, "no image provided (use multipart 'image' field)")
			return
		}
		imageData, decodeErr := decodeBase64Body(body)
		if decodeErr != nil {
			writeError(w, http.StatusBadRequest, "failed to decode image data")
			return
		}
		filePath, saveErr := h.saveImage(id, imageData)
		if saveErr != nil {
			writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to save image: %v", saveErr))
			return
		}
		h.queue.Complete(id, filePath)
		writeJSON(w, http.StatusOK, map[string]string{"file_path": filePath})
		return
	}
	defer file.Close()

	imageData, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read image data")
		return
	}

	filePath, err := h.saveImage(id, imageData)
	if err != nil {
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("failed to save image: %v", err))
		return
	}

	h.queue.Complete(id, filePath)
	log.Printf("[Browser] Image uploaded & task completed: id=%s path=%s", id, filePath)
	writeJSON(w, http.StatusOK, map[string]string{"file_path": filePath})
}

func (h *Handler) handleStats(w http.ResponseWriter, _ *http.Request) {
	stats := h.queue.Stats()
	writeJSON(w, http.StatusOK, stats)
}

// --- Internal helpers ---

func (h *Handler) saveImage(taskID string, data []byte) (string, error) {
	imgDir := filepath.Join(h.dataDir, "browser_images")
	if err := os.MkdirAll(imgDir, 0o755); err != nil {
		return "", err
	}
	fileName := fmt.Sprintf("%s.png", taskID)
	filePath := filepath.Join(imgDir, fileName)
	if err := os.WriteFile(filePath, data, 0o644); err != nil {
		return "", err
	}
	return filepath.Join("browser_images", fileName), nil
}

// decodeBase64Body tries multiple formats: JSON with image/data fields, raw base64, or data URL.
func decodeBase64Body(body []byte) ([]byte, error) {
	var parsed struct {
		Image string `json:"image"`
		Data  string `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil {
		if parsed.Image != "" {
			return decodeBase64(parsed.Image)
		}
		if parsed.Data != "" {
			return decodeBase64(parsed.Data)
		}
	}
	return decodeBase64(string(body))
}

// decodeBase64 strips common base64 prefixes (data URL, "base64," label) and decodes.
func decodeBase64(s string) ([]byte, error) {
	// Strip data URL prefix if present
	const prefix = "base64,"
	if idx := strings.Index(s, prefix); idx >= 0 {
		s = s[idx+len(prefix):]
	}
	// Also handle data:image/...;base64,... format
	if idx := strings.Index(s, ";base64,"); idx >= 0 {
		s = s[idx+len(";base64,"):]
	}
	return base64.StdEncoding.DecodeString(s)
}

// --- HTTP helpers ---

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
