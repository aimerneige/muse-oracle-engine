package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/aimerneige/lovelive-manga-generator/pkg/img"
	"github.com/aimerneige/lovelive-manga-generator/pkg/llm"
	"github.com/aimerneige/lovelive-manga-generator/pkg/worker"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}

	deepseekApiKey := os.Getenv("DEEPSEEK_API_KEY")
	if deepseekApiKey == "" {
		log.Fatal("DEEPSEEK_API_KEY is not set")
	}
	deepseek := llm.NewDeepSeekAdapter(deepseekApiKey, llm.DeepSeekChat)

	geminiApiKey := os.Getenv("GEMINI_API_KEY")
	if geminiApiKey == "" {
		log.Fatal("GEMINI_API_KEY is not set")
	}
	nanobanana, err := img.NewNanobananaAdapter(geminiApiKey, img.NanoBanana)
	if err != nil {
		log.Fatal("Error creating nanobanana adapter: ", err)
	}

	ctx := context.Background()

	hint := `LoveLive 中的穗乃果和海未为主角。二人在学校里的温馨日常。发糖向，轻百合向。角色台词和行为要符合官方设定，绝对禁止OOC。长度控制在 24 格，剧情要连贯，不要拆分成多个小剧场。`

	history, step1Resp, err := worker.GenerateStorybookStep1(ctx, hint, deepseek)
	if err != nil {
		log.Fatalf("Error generating storybook step 1: %v", err)
	}

	_, storybook, err := worker.GenerateStorybookStep2(ctx, history, step1Resp, deepseek)
	if err != nil {
		log.Fatal("Error generating storybook step 2: ", err)
	}

	// 创建输出目录
	outputUUID := uuid.New().String()
	outputDir := filepath.Join("imgs", time.Now().Format("20060102"), outputUUID)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Fatal("Error creating output directory: ", err)
	}

	// 生成图片
	comicGenerator := worker.NewComicImageGenerator(nanobanana)
	for i, page := range storybook {
		timestamp := time.Now().Unix()
		imageData, err := comicGenerator.Generate(ctx, worker.StyleChibiFigure, step1Resp.Character, page)
		if err != nil {
			log.Printf("Error generating image for page %d: %v", i+1, err)
			continue
		}

		imagePath := filepath.Join(outputDir, fmt.Sprintf("%03d_%d.png", i+1, timestamp))
		if err := os.WriteFile(imagePath, imageData, 0644); err != nil {
			log.Printf("Error saving image for page %d: %v", i+1, err)
			continue
		}
		log.Printf("Saved image: %s", imagePath)
	}
}
