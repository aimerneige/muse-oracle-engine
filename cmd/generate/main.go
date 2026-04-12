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
	log.Println("=== LoveLive Manga Generator 启动 ===")

	if err := godotenv.Load(); err != nil {
		log.Fatal("Error loading .env file")
	}
	log.Println("✓ 配置文件加载成功")

	deepseekApiKey := os.Getenv("DEEPSEEK_API_KEY")
	if deepseekApiKey == "" {
		log.Fatal("DEEPSEEK_API_KEY is not set")
	}
	deepseek := llm.NewDeepSeekAdapter(deepseekApiKey, llm.DeepSeekChat)
	log.Println("✓ DeepSeek 适配器初始化成功")

	geminiApiKey := os.Getenv("GEMINI_API_KEY")
	if geminiApiKey == "" {
		log.Fatal("GEMINI_API_KEY is not set")
	}
	nanobanana, err := img.NewNanobananaAdapter(geminiApiKey, img.NanoBanana)
	if err != nil {
		log.Fatal("Error creating nanobanana adapter: ", err)
	}
	log.Println("✓ Nanobanana 适配器初始化成功")

	ctx := context.Background()

	hint := `LoveLive 中的穗乃果和海未为主角。二人在学校里的温馨日常。发糖向，轻百合向。角色台词和行为要符合官方设定，绝对禁止OOC。长度控制在 24 格，剧情要连贯，不要拆分成多个小剧场。`
	log.Printf("提示词: %s", hint)

	log.Println(">>> 开始生成故事脚本 (步骤 1/2)...")
	history, step1Resp, err := worker.GenerateStorybookStep1(ctx, hint, deepseek)
	if err != nil {
		log.Fatalf("Error generating storybook step 1: %v", err)
	}
	log.Println("✓ 故事脚本生成完成 (步骤 1/2)")

	log.Println(">>> 开始生成漫画分镜 (步骤 2/2)...")
	_, storybook, err := worker.GenerateStorybookStep2(ctx, history, step1Resp, deepseek)
	if err != nil {
		log.Fatal("Error generating storybook step 2: ", err)
	}
	log.Printf("✓ 漫画分镜生成完成 (步骤 2/2), 共 %d 幅", len(storybook))

	// 创建输出目录
	outputUUID := uuid.New().String()
	outputDir := filepath.Join("imgs", time.Now().Format("20060102"), outputUUID)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Fatal("Error creating output directory: ", err)
	}
	log.Printf("✓ 输出目录创建成功: %s", outputDir)

	// 生成图片
	log.Printf(">>> 开始生成漫画图片, 共 %d 幅...", len(storybook))
	comicGenerator := worker.NewComicImageGenerator(nanobanana)
	for i, page := range storybook {
		log.Printf("[%d/%d] 正在生成第 %d 幅漫画...", i+1, len(storybook), i+1)
		timestamp := time.Now().Unix()
		imageData, err := comicGenerator.Generate(ctx, worker.StyleChibiFigure, step1Resp.Character, page)
		if err != nil {
			log.Printf("[%d/%d] ✗ 生成失败: %v", i+1, len(storybook), err)
			continue
		}

		imagePath := filepath.Join(outputDir, fmt.Sprintf("%03d_%d.png", i+1, timestamp))
		if err := os.WriteFile(imagePath, imageData, 0644); err != nil {
			log.Printf("[%d/%d] ✗ 保存失败: %v", i+1, len(storybook), err)
			continue
		}
		log.Printf("[%d/%d] ✓ 图片保存成功: %s", i+1, len(storybook), imagePath)
	}

	log.Println("=== 全部任务完成 ===")
}
