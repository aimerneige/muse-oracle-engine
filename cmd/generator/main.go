package main

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/aimerneige/lovelive-manga-generator/pkg/agent"
	"github.com/aimerneige/lovelive-manga-generator/pkg/llm"
	"github.com/joho/godotenv"
	"path/filepath"
)

func main() {
	// 加载 .env 文件（如果存在）
	if err := godotenv.Load(); err != nil {
		log.Println("提示：未找到 .env 文件或读取失败，将尝试直接使用系统环境变量。")
	}

	// 确保设置了 Gemini 的 API Key
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Println("警告：未设置 GEMINI_API_KEY 环境变量，请确保在运行前设置。")
	}

	// 1. 初始化 Client
	llmClient := llm.NewClient(llm.Config{
		GeminiAPIKey: apiKey,
	})

	// 2. 初始化 Agent
	aiAgent, err := agent.NewAgent(llmClient, llm.ModelGemini31Pro)
	if err != nil {
		log.Fatalf("初始化 Agent 失败: %v", err)
	}

	// 3. 读取用户输入的剧情
	fmt.Println("========================================")
	fmt.Println("请在此输入漫画剧情描述 (输入 'EOF' 单独占一行结束):")
	fmt.Println("========================================")

	var plotBuilder strings.Builder
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "EOF" {
			break
		}
		plotBuilder.WriteString(line + "\n")
	}

	if err := scanner.Err(); err != nil {
		log.Fatalf("读取输入失败: %v", err)
	}

	plot := strings.TrimSpace(plotBuilder.String())
	if plot == "" {
		log.Fatal("未检测到有效剧情输入，程序退出。")
	}

	fmt.Println("\n正在构思分镜...请稍候...")

	// 4. 调用 AI 生成漫画分镜脚本
	// 注意这里使用了你在 pkg/agent/templates 中定义好的模板文件名
	storyboard, err := aiAgent.Generate(context.Background(), "storyboard-script.md", plot)
	if err != nil {
		log.Fatalf("生成失败: %v", err)
	}

	// 5. 输出结果
	fmt.Println("\n========== 【生成结果】 ==========")
	fmt.Println(storyboard)
	fmt.Println("\n==================================")

	// 6. 提取图片 Prompt 并生成
	fmt.Println("\n========== 【开始生成图像】 ==========")
	extractAndGenerateImages(llmClient, storyboard)
}

func extractAndGenerateImages(llmClient llm.Client, storyboard string) {
	fmt.Println(">> 正在为您一次性生成整张四格漫画图片...")
	req := llm.Request{
		Model: llm.ModelNanoBanana2, 
		Messages: []llm.Message{
			{Role: "user", Content: "请根据以下完整的四格漫画分镜描述，一次性生成一张包含四个格子的完整漫画图片（拼图中包含起承转合四个画面），请严格保持角色服饰和各项细节设定的准确性：\n\n" + storyboard},
		},
	}

	resp, err := llmClient.Chat(context.Background(), req)
	if err != nil {
		log.Printf("图片生成请求失败: %v\n", err)
		return
	}

	if len(resp.Images) > 0 {
		filename := filepath.Join("imgs", "comic.png")
		err := os.WriteFile(filename, resp.Images[0], 0644)
		if err != nil {
			log.Printf("保存图片失败: %v\n", err)
		} else {
			fmt.Printf("   成功保存完整四格漫画: %s\n", filename)
		}
	} else {
		log.Printf("未返回图像数据，只返回了文本: %s\n", resp.Content)
	}
}
