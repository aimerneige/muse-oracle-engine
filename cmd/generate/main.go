package main

import (
	"context"
	"log"
	"os"

	"github.com/aimerneige/lovelive-manga-generator/pkg/llm"
	"github.com/aimerneige/lovelive-manga-generator/pkg/worker"
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

	ctx := context.Background()

	hint := `LoveLive 中的穗乃果和海未为主角。二人在学校里的温馨日常。发糖向，轻百合向。角色台词和行为要符合官方设定，绝对禁止OOC。长度控制在 24 格，剧情要连贯，不要拆分成多个小剧场。`

	history, step1Resp, err := worker.GenerateStorybookStep1(ctx, hint, deepseek)
	if err != nil {
		log.Fatalf("Error generating storybook step 1: %v", err)
	}

	log.Printf("Step 1 Response: %+v", step1Resp)
	log.Printf("History: %+v", history)
}
