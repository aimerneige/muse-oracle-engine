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
}
