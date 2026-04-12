package img

import (
	"context"
)

type ImgProvider interface {
	GenerateImage(ctx context.Context, prompt string) ([]byte, error)
}
