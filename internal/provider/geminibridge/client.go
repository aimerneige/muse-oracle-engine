package geminibridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	defaultEndpoint     = "http://127.0.0.1:8765"
	defaultPollInterval = 2 * time.Second
	maxTaskAttempts     = 3
)

// Client talks to a local gemini_bridge server.
type Client struct {
	endpoint     string
	model        string
	timeout      time.Duration
	pollInterval time.Duration
	httpClient   *http.Client
}

type createTaskRequest struct {
	Prompt string `json:"prompt"`
	Tag    string `json:"tag,omitempty"`
	Model  string `json:"model,omitempty"`
}

// Task is the subset of gemini_bridge TaskOut used by providers.
type Task struct {
	ID           string        `json:"id"`
	Status       string        `json:"status"`
	Error        string        `json:"error"`
	ResultText   string        `json:"result_text"`
	ResultImages []ResultImage `json:"result_images"`
}

// ResultImage is the subset of gemini_bridge ImageMeta used by image providers.
type ResultImage struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

// NewClient creates a Gemini Bridge HTTP client.
func NewClient(endpoint string, model string, timeout time.Duration) *Client {
	if endpoint == "" {
		endpoint = defaultEndpoint
	}
	return &Client{
		endpoint:     strings.TrimRight(endpoint, "/"),
		model:        model,
		timeout:      timeout,
		pollInterval: defaultPollInterval,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
	}
}

// RunTask enqueues a prompt and waits until gemini_bridge marks it done or failed.
func (c *Client) RunTask(ctx context.Context, prompt string, tag string) (*Task, error) {
	var lastErr error
	for attempt := 1; attempt <= maxTaskAttempts; attempt++ {
		task, err := c.runTaskOnce(ctx, prompt, tag)
		if err == nil {
			return task, nil
		}
		lastErr = err
		if attempt < maxTaskAttempts {
			log.Printf("Gemini Bridge task attempt %d/%d failed: %v; retrying", attempt, maxTaskAttempts, err)
		}
	}
	return nil, fmt.Errorf("gemini-bridge: task failed after %d attempts: %w", maxTaskAttempts, lastErr)
}

func (c *Client) runTaskOnce(ctx context.Context, prompt string, tag string) (*Task, error) {
	task, err := c.createTask(ctx, prompt, tag)
	if err != nil {
		return nil, err
	}
	return c.waitTask(ctx, task.ID)
}

func (c *Client) createTask(ctx context.Context, prompt string, tag string) (*Task, error) {
	reqBody := createTaskRequest{
		Prompt: prompt,
		Tag:    tag,
		Model:  c.model,
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("gemini-bridge: failed to marshal create task request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+"/tasks", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("gemini-bridge: failed to create task request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	var task Task
	if err := c.doJSON(req, http.StatusCreated, &task); err != nil {
		return nil, err
	}
	if task.ID == "" {
		return nil, fmt.Errorf("gemini-bridge: create task response missing id")
	}
	return &task, nil
}

func (c *Client) waitTask(ctx context.Context, taskID string) (*Task, error) {
	waitCtx := ctx
	var cancel context.CancelFunc
	if c.timeout > 0 {
		waitCtx, cancel = context.WithTimeout(ctx, c.timeout)
		defer cancel()
	}

	for {
		task, err := c.getTask(waitCtx, taskID)
		if err != nil {
			return nil, err
		}
		switch task.Status {
		case "done":
			return task, nil
		case "failed":
			if task.Error == "" {
				return task, fmt.Errorf("gemini-bridge: task %s failed", task.ID)
			}
			return task, fmt.Errorf("gemini-bridge: task %s failed: %s", task.ID, task.Error)
		}

		timer := time.NewTimer(c.pollInterval)
		select {
		case <-waitCtx.Done():
			timer.Stop()
			return nil, fmt.Errorf("gemini-bridge: task %s wait timeout: %w", taskID, waitCtx.Err())
		case <-timer.C:
		}
	}
}

func (c *Client) getTask(ctx context.Context, taskID string) (*Task, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"/tasks/"+taskID, nil)
	if err != nil {
		return nil, fmt.Errorf("gemini-bridge: failed to create get task request: %w", err)
	}

	var task Task
	if err := c.doJSON(req, http.StatusOK, &task); err != nil {
		return nil, err
	}
	return &task, nil
}

func (c *Client) doJSON(req *http.Request, expectedStatus int, out any) error {
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("gemini-bridge: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("gemini-bridge: failed to read response body: %w", err)
	}
	if resp.StatusCode != expectedStatus {
		return fmt.Errorf("gemini-bridge: API returned status %d: %s", resp.StatusCode, string(respBody))
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("gemini-bridge: failed to parse response: %w", err)
	}
	return nil
}
