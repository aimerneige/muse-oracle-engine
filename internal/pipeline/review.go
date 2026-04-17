package pipeline

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/aimerneige/muse-oracle-engine/internal/domain"
)

// ReviewCallback is a function that handles the review interaction.
// It receives the storyboard content and returns:
// - approved: true if the user approves the storyboard
// - feedback: optional feedback text if not approved (for re-generation)
type ReviewCallback func(ctx context.Context, project *domain.Project) (approved bool, feedback string, err error)

// ReviewStep implements a review gate that pauses the pipeline
// and waits for external approval before proceeding.
type ReviewStep struct {
	callback ReviewCallback
}

// NewReviewStep creates a review step with the given callback.
// For CLI usage, use NewCLIReviewStep().
// For API usage, provide a custom callback that waits for HTTP input.
func NewReviewStep(callback ReviewCallback) *ReviewStep {
	return &ReviewStep{callback: callback}
}

// NewCLIReviewStep creates a review step that interacts via the terminal.
func NewCLIReviewStep() *ReviewStep {
	return &ReviewStep{callback: cliReviewCallback}
}

func (r *ReviewStep) ID() StepID { return StepReviewStoryboard }

func (r *ReviewStep) Execute(ctx context.Context, project *domain.Project) error {
	if project.Storyboard == nil {
		return fmt.Errorf("no storyboard to review")
	}

	project.Status = domain.StatusReviewPending

	approved, feedback, err := r.callback(ctx, project)
	if err != nil {
		return fmt.Errorf("review failed: %w", err)
	}

	if approved {
		project.Status = domain.StatusReviewApproved
		return nil
	}

	// Not approved — save feedback and mark as needing re-generation
	project.ReviewFeedback = feedback
	project.Status = domain.StatusStoryboardDone
	return fmt.Errorf("storyboard rejected by reviewer, feedback: %s", feedback)
}

// cliReviewCallback is the default review callback for CLI mode.
func cliReviewCallback(_ context.Context, project *domain.Project) (bool, string, error) {
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("📋 分镜脚本 Review")
	fmt.Println(strings.Repeat("=", 60))

	for _, panel := range project.Storyboard.Panels {
		fmt.Printf("\n--- 第 %d 话 ---\n", panel.Index)
		fmt.Println(panel.Content)
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Printf("共 %d 话分镜脚本，是否通过？\n", len(project.Storyboard.Panels))
	fmt.Println("  [y] 通过，继续生成图片")
	fmt.Println("  [n] 不通过，重新生成分镜")
	fmt.Print("请选择 (y/n): ")

	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return false, "", fmt.Errorf("failed to read input: %w", err)
	}

	input = strings.TrimSpace(strings.ToLower(input))

	if input == "y" || input == "yes" {
		return true, "", nil
	}

	fmt.Print("请输入反馈意见（可选，直接回车跳过）: ")
	feedback, err := reader.ReadString('\n')
	if err != nil {
		return false, "", fmt.Errorf("failed to read feedback: %w", err)
	}

	return false, strings.TrimSpace(feedback), nil
}
