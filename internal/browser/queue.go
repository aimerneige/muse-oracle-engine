package browser

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

// TaskStatus represents the lifecycle state of an image generation task.
type TaskStatus string

const (
	TaskPending   TaskStatus = "pending"   // waiting to be picked up by browser agent
	TaskRunning   TaskStatus = "running"   // currently being processed by browser agent
	TaskCompleted TaskStatus = "completed" // image downloaded successfully
	TaskFailed    TaskStatus = "failed"    // browser agent reported failure
)

// Task represents a single image generation job to be executed by the browser agent.
type Task struct {
	ID        string      `json:"id"`
	Prompt    string      `json:"prompt"`              // the full prompt text to type into Gemini
	Status    TaskStatus  `json:"status"`              // current lifecycle status
	FilePath string      `json:"file_path,omitempty"` // relative path of saved image (after completion)
	Error     string      `json:"error,omitempty"`     // error message if failed
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
	// ImageData is NOT serialized; used for in-memory image upload handling
	ImageData []byte `json:"-"`
}

// Queue manages the ordered list of image generation tasks backed by a JSON file.
type Queue struct {
	mu      sync.RWMutex
	tasks   map[string]*Task
	order   []string // FIFO order of pending+running task IDs
	dataDir string
}

// NewQueue creates a task queue persisted in dataDir/browser_tasks.json.
func NewQueue(dataDir string) (*Queue, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create browser queue dir: %w", err)
	}
	q := &Queue{
		tasks:   make(map[string]*Task),
		order:   make([]string, 0),
		dataDir: dataDir,
	}
	if err := q.load(); err != nil {
		// If file doesn't exist, start fresh
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("failed to load queue: %w", err)
		}
	}
	return q, nil
}

func (q *Queue) filePath() string {
	return filepath.Join(q.dataDir, "browser_tasks.json")
}

func (q *Queue) load() error {
	data, err := os.ReadFile(q.filePath())
	if err != nil {
		return err
	}
	var tasks []*Task
	if err := json.Unmarshal(data, &tasks); err != nil {
		return err
	}
	q.tasks = make(map[string]*Task, len(tasks))
	q.order = make([]string, 0, len(tasks))
	for _, t := range tasks {
		q.tasks[t.ID] = t
		if t.Status == TaskPending || t.Status == TaskRunning {
			q.order = append(q.order, t.ID)
		}
	}
	return nil
}

func (q *Queue) save() error {
	all := make([]*Task, 0, len(q.tasks))
	for _, t := range q.tasks {
		all = append(all, t)
	}
	data, err := json.MarshalIndent(all, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal queue: %w", err)
	}
	return os.WriteFile(q.filePath(), data, 0o644)
}

// Enqueue adds a new pending task to the end of the queue.
func (q *Queue) Enqueue(prompt string) (*Task, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	now := time.Now()
	task := &Task{
		ID:        uuid.New().String(),
		Prompt:    prompt,
		Status:    TaskPending,
		CreatedAt: now,
		UpdatedAt: now,
	}
	q.tasks[task.ID] = task
	q.order = append(q.order, task.ID)

	if err := q.save(); err != nil {
		// rollback
		delete(q.tasks, task.ID)
		q.order = q.order[:len(q.order)-1]
		return nil, err
	}
	return task, nil
}

// Pending returns the first pending task without removing it, or nil if none available.
func (q *Queue) Pending() *Task {
	q.mu.Lock()
	defer q.mu.Unlock()

	for len(q.order) > 0 {
		id := q.order[0]
		t, ok := q.tasks[id]
		if !ok || t.Status != TaskPending {
			q.order = q.order[1:]
			continue
		}
		return t
	}
	return nil
}

// Acquire atomically marks a pending task as running and returns it.
// Returns nil if no pending task is available.
func (q *Queue) Acquire() *Task {
	q.mu.Lock()
	defer q.mu.Unlock()

	for len(q.order) > 0 {
		id := q.order[0]
		t, ok := q.tasks[id]
		if !ok || t.Status != TaskPending {
			q.order = q.order[1:]
			continue
		}
		t.Status = TaskRunning
		t.UpdatedAt = time.Now()
		_ = q.save()
		return t
	}
	return nil
}

// Complete marks a task as completed with the saved image file path.
func (q *Queue) Complete(id, filePath string) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	t, ok := q.tasks[id]
	if !ok {
		return fmt.Errorf("task %s not found", id)
	}
	t.Status = TaskCompleted
	t.FilePath = filePath
	t.Error = ""
	t.UpdatedAt = time.Now()
	return q.save()
}

// Fail marks a task as failed with an error message.
func (q *Queue) Fail(id, errMsg string) error {
	q.mu.Lock()
	defer q.mu.Unlock()

	t, ok := q.tasks[id]
	if !ok {
		return fmt.Errorf("task %s not found", id)
	}
	t.Status = TaskFailed
	t.Error = errMsg
	t.UpdatedAt = time.Now()
	return q.save()
}

// Get returns a task by ID.
func (q *Queue) Get(id string) (*Task, error) {
	q.mu.RLock()
	defer q.mu.RUnlock()

	t, ok := q.tasks[id]
	if !ok {
		return nil, fmt.Errorf("task %s not found", id)
	}
	return t, nil
}

// List returns all tasks, ordered by creation time.
func (q *Queue) List() []*Task {
	q.mu.RLock()
	defer q.mu.RUnlock()

	result := make([]*Task, 0, len(q.tasks))
	for _, t := range q.tasks {
		result = append(result, t)
	}
	// sort by CreatedAt
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			if result[j].CreatedAt.Before(result[i].CreatedAt) {
				result[i], result[j] = result[j], result[i]
			}
		}
	}
	return result
}

// Stats returns summary counts per status.
func (q *Queue) Stats() map[TaskStatus]int {
	q.mu.RLock()
	defer q.mu.RUnlock()

	stats := map[TaskStatus]int{
		TaskPending:   0,
		TaskRunning:   0,
		TaskCompleted: 0,
		TaskFailed:    0,
	}
	for _, t := range q.tasks {
		stats[t.Status]++
	}
	return stats
}
