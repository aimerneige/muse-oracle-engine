package geminibridge

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRunTaskRetriesFailedTasks(t *testing.T) {
	t.Parallel()

	createCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/tasks":
			createCount++
			writeTestJSON(t, w, http.StatusCreated, Task{ID: fmt.Sprintf("task-%d", createCount), Status: "pending"})
		case r.Method == http.MethodGet:
			if r.URL.Path == "/tasks/task-3" {
				writeTestJSON(t, w, http.StatusOK, Task{ID: "task-3", Status: "done", ResultText: "ok"})
				return
			}
			writeTestJSON(t, w, http.StatusOK, Task{ID: r.URL.Path, Status: "failed", Error: "temporary failure"})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()

	client := NewClient(server.URL, "pro", time.Second)
	task, err := client.RunTask(context.Background(), "prompt", "test")
	if err != nil {
		t.Fatalf("RunTask returned error: %v", err)
	}
	if task.ResultText != "ok" {
		t.Fatalf("expected successful retry result, got %+v", task)
	}
	if createCount != 3 {
		t.Fatalf("expected three task creation attempts, got %d", createCount)
	}
}

func writeTestJSON(t *testing.T, w http.ResponseWriter, status int, data any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		t.Fatalf("failed to write test response: %v", err)
	}
}
