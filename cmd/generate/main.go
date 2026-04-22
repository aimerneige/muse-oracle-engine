package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aimerneige/muse-oracle-engine/internal/chardb"
	"github.com/aimerneige/muse-oracle-engine/internal/config"
	"github.com/aimerneige/muse-oracle-engine/internal/domain"
	"github.com/aimerneige/muse-oracle-engine/internal/pipeline"
	"github.com/aimerneige/muse-oracle-engine/internal/prompt"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/image"
	"github.com/aimerneige/muse-oracle-engine/internal/provider/llm"
	"github.com/aimerneige/muse-oracle-engine/internal/service"
	"github.com/aimerneige/muse-oracle-engine/internal/storage"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func main() {
	// Define flags
	characters := flag.String("characters", "", "Comma-separated character IDs, e.g. 'lovelive/honoka,lovelive/umi'")
	plotHint := flag.String("plot", "", "Story direction / plot hint")
	style := flag.String("style", "chibi_figure", "Comic style: chibi_figure, figma_figure, watercolor")
	resumeID := flag.String("resume", "", "Resume an existing project by ID")
	retryImage := flag.Int("retry-image", 0, "Retry generating a specific image by 1-based index (requires --resume)")
	listChars := flag.Bool("list-characters", false, "List all available characters")
	listStyles := flag.Bool("list-styles", false, "List all available comic styles")
	listModels := flag.Bool("list-models", false, "List all available models")
	promptOnly := flag.Bool("prompt-only", false, "Output prompts instead of calling image generation API")
	flag.Parse()

	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("Warning: .env file not found, using environment variables")
	}

	cfg := config.LoadFromEnv()

	// Initialize character database
	charRegistry, err := chardb.NewEmbeddedRegistry()
	if err != nil {
		log.Fatalf("Failed to load character database: %v", err)
	}
	// Load user-defined characters from external directory (if configured)
	if cfg.CharDBDir != "" {
		if err := charRegistry.LoadExternalDir(cfg.CharDBDir); err != nil {
			log.Printf("Warning: failed to load external characters: %v", err)
		}
	}

	// Initialize prompt engine early so custom styles are loaded for --list-styles
	promptEngine, err := prompt.NewEngine()
	if err != nil {
		log.Fatalf("Failed to initialize prompt engine: %v", err)
	}
	if cfg.StylesDir != "" {
		if err := promptEngine.LoadExternalDir(cfg.StylesDir); err != nil {
			log.Printf("Warning: failed to load external styles: %v", err)
		}
	}

	// Handle list commands
	if *listChars {
		printCharacters(charRegistry)
		return
	}
	if *listStyles {
		printStyles()
		return
	}
	if *listModels {
		printModels()
		return
	}

	// Override image provider to prompt-only if flag is set
	if *promptOnly {
		cfg.ImageProvider = "prompt"
	}

	// Validate config
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	// Initialize LLM provider
	llmProvider, err := createLLMProvider(cfg)
	if err != nil {
		log.Fatalf("Failed to create LLM provider: %v", err)
	}
	log.Printf("✓ LLM provider: %s", llmProvider.Name())

	// Initialize image provider
	imgProvider, err := createImageProvider(cfg)
	if err != nil {
		log.Fatalf("Failed to create image provider: %v", err)
	}
	log.Printf("✓ Image provider: %s", imgProvider.Name())

	// Initialize storage
	store, err := storage.NewFileStore(cfg.DataDir)
	if err != nil {
		log.Fatalf("Failed to initialize storage: %v", err)
	}

	// Initialize services
	storySvc := service.NewStoryService(llmProvider, promptEngine)
	comicSvc := service.NewComicService(imgProvider, promptEngine, store)

	// Build pipeline steps
	steps := []pipeline.Step{
		pipeline.NewStoryboardStep(storySvc),
		pipeline.NewCLIReviewStep(),
		pipeline.NewImageStep(comicSvc),
	}

	p := pipeline.NewPipeline(store, steps...)

	ctx := context.Background()

	// Create or resume project
	var project *domain.Project
	if *resumeID != "" {
		project, err = store.Load(*resumeID)
		if err != nil {
			log.Fatalf("Failed to load project %s: %v", *resumeID, err)
		}
		log.Printf("✓ Resumed project: %s (status: %s)", project.ID, project.Status)
	} else {
		// Validate required inputs
		if *characters == "" || *plotHint == "" {
			fmt.Println("Usage: generate --characters <ids> --plot <hint> [--style <style>]")
			fmt.Println()
			fmt.Println("Example:")
			fmt.Println("  generate --characters 'lovelive/honoka,lovelive/umi' \\")
			fmt.Println("           --plot '二人在学校里的温馨日常，发糖向，轻百合向' \\")
			fmt.Println("           --style chibi_figure")
			fmt.Println()
			fmt.Println("Run with --list-characters or --list-styles to see available options.")
			os.Exit(1)
		}

		project, err = createProject(charRegistry, *characters, *plotHint, *style)
		if err != nil {
			log.Fatalf("Failed to create project: %v", err)
		}
		log.Printf("✓ Created project: %s", project.ID)
	}

	// Handle single image retry
	if *retryImage > 0 {
		if *resumeID == "" {
			log.Fatalf("--retry-image requires --resume to specify the project")
		}
		if project.Storyboard == nil || len(project.Images) == 0 {
			log.Fatalf("Project has no images to retry — generate images first")
		}
		if *retryImage > len(project.Images) {
			log.Fatalf("Image index %d out of range [1, %d]", *retryImage, len(project.Images))
		}

		imgIdx := *retryImage
		attempt := project.Images[imgIdx-1].Attempt + 1
		log.Printf("=== 重试生成第 %d 张图片 (attempt %d) ===", imgIdx, attempt)

		project.ResetSingleImage(imgIdx)

		if err := comicSvc.GenerateSingleImage(ctx, project, imgIdx); err != nil {
			_ = store.Save(project)
			log.Fatalf("Failed to generate image %d: %v", imgIdx, err)
		}

		if err := store.Save(project); err != nil {
			log.Fatalf("Failed to save project: %v", err)
		}

		img := project.Images[imgIdx-1]
		log.Printf("✓ 第 %d 张图片已重新生成: %s", imgIdx, img.FilePath)
		return
	}

	// Run pipeline
	log.Println("=== 开始生成漫画 ===")
	if err := p.Run(ctx, project); err != nil {
		log.Printf("Pipeline error: %v", err)
		log.Printf("Project saved. Resume with: generate --resume %s", project.ID)
		os.Exit(1)
	}

	log.Println("=== 全部任务完成 ===")
	log.Printf("输出目录: %s", store.ProjectDir(project.ID))
}

func createProject(reg *chardb.Registry, characterIDs, plotHint, styleName string) (*domain.Project, error) {
	// Parse character IDs
	ids := strings.Split(characterIDs, ",")
	var chars []domain.Character
	for _, id := range ids {
		id = strings.TrimSpace(id)
		c, ok := reg.GetCharacter(id)
		if !ok {
			return nil, fmt.Errorf("character not found: %s", id)
		}
		chars = append(chars, c)
	}

	// Validate style
	comicStyle := domain.ComicStyle(styleName)
	if !comicStyle.IsValid() {
		return nil, fmt.Errorf("unknown comic style: %s", styleName)
	}

	return &domain.Project{
		ID:         uuid.New().String(),
		Status:     domain.StatusCreated,
		Characters: chars,
		PlotHint:   plotHint,
		Style:      comicStyle,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}, nil
}

func createLLMProvider(cfg *config.Config) (llm.Provider, error) {
	switch cfg.LLMProvider {
	case "mock":
		return llm.NewMockProvider(), nil
	case "gemini":
		model := llm.Gemini3Pro // default
		// Map common model strings to enum
		switch cfg.LLMModel {
		case "gemini-3.1-pro-preview":
			model = llm.Gemini3Pro
		case "gemini-3-flash-preview":
			model = llm.Gemini3Flash
		case "gemini-3.1-flash-lite-preview":
			model = llm.Gemini3FlashLite
		case "gemini-2.5-pro":
			model = llm.Gemini2Pro
		case "gemini-2.5-flash":
			model = llm.Gemini2Flash
		case "gemini-2.5-flash-lite":
			model = llm.Gemini2FlashLite
		}
		return llm.NewGeminiAdapter(cfg.GeminiAPIKey, model)
	case "deepseek":
		model := llm.DeepSeekChat
		if cfg.LLMModel == "deepseek-reasoner" {
			model = llm.DeepSeekReasoner
		}
		return llm.NewDeepSeekAdapter(cfg.DeepSeekAPIKey, model), nil
	case "openrouter":
		return llm.NewOpenRouterAdapter(cfg.OpenRouterKey, cfg.LLMModel), nil
	case "302ai":
		return llm.NewThreeOTwoAdapter(cfg.ThreeOTwoKey, cfg.LLMModel), nil
	default:
		return nil, fmt.Errorf("unknown LLM provider: %s", cfg.LLMProvider)
	}
}

func createImageProvider(cfg *config.Config) (image.Provider, error) {
	switch cfg.ImageProvider {
	case "mock":
		return image.NewMockProvider(), nil
	case "prompt":
		return image.NewDryRunProvider(), nil
	case "gemini":
		model := image.GeminiImage31Flash // default
		switch cfg.ImageModel {
		case "gemini-3.1-flash-image-preview":
			model = image.GeminiImage31Flash
		case "gemini-3-pro-image-preview":
			model = image.GeminiImage3Pro
		case "gemini-2.5-flash-image":
			model = image.GeminiImage25Flash
		}
		return image.NewGeminiImageAdapter(cfg.GeminiAPIKey, model)
	case "openai":
		model := image.DALLE3
		switch cfg.ImageModel {
		case "dall-e-2":
			model = image.DALLE2
		case "dall-e-3":
			model = image.DALLE3
		}
		return image.NewOpenAIImageAdapter(cfg.OpenAIAPIKey, model), nil
	case "gpt2":
		return image.NewGPT2ImageAdapter(cfg), nil
	default:
		return nil, fmt.Errorf("unknown image provider: %s", cfg.ImageProvider)
	}
}

func printCharacters(reg *chardb.Registry) {
	for _, series := range reg.ListSeries() {
		fmt.Printf("\n📺 %s (%s)\n", series.Name, series.ID)
		chars := reg.ListCharacters(series.ID)
		for _, c := range chars {
			fmt.Printf("   ├─ %s/%s — %s (%s)\n", c.Series, c.ID, c.Name, c.NameEN)
		}
	}
}

func printStyles() {
	fmt.Println("\n🎨 可用画风:")
	for _, meta := range domain.StyleRegistry {
		fmt.Printf("   ├─ %-15s — %s\n", meta.ID, meta.Description)
	}
}

func printModels() {
	fmt.Println("\n🤖 LLM 模型:")
	fmt.Println("  Provider: gemini")
	fmt.Println("   ├─ gemini-3.1-pro-preview      (Gemini 3.1 Pro)")
	fmt.Println("   ├─ gemini-3-flash-preview       (Gemini 3 Flash)")
	fmt.Println("   ├─ gemini-3.1-flash-lite-preview (Gemini 3.1 Flash Lite)")
	fmt.Println("   ├─ gemini-2.5-pro               (Gemini 2.5 Pro)")
	fmt.Println("   ├─ gemini-2.5-flash             (Gemini 2.5 Flash)")
	fmt.Println("   └─ gemini-2.5-flash-lite        (Gemini 2.5 Flash Lite)")
	fmt.Println("  Provider: deepseek")
	fmt.Println("   ├─ deepseek-chat                (DeepSeek Chat)")
	fmt.Println("   └─ deepseek-reasoner            (DeepSeek Reasoner)")
	fmt.Println("  Provider: openrouter")
	fmt.Println("   └─ (任意模型名称，如 google/gemini-2.5-pro)")
	fmt.Println("  Provider: 302ai")
	fmt.Println("   └─ (任意模型名称)")

	fmt.Println("\n🖼️  图像生成模型:")
	fmt.Println("  Provider: gemini")
	fmt.Println("   ├─ gemini-3.1-flash-image-preview (Gemini 3.1 Flash Image)")
	fmt.Println("   ├─ gemini-3-pro-image-preview     (Gemini 3 Pro Image)")
	fmt.Println("   └─ gemini-2.5-flash-image         (Gemini 2.5 Flash Image)")
	fmt.Println("  Provider: openai")
	fmt.Println("   ├─ dall-e-3 (DALL·E 3, 默认)")
	fmt.Println("   └─ dall-e-2 (DALL·E 2)")
	fmt.Println("  Provider: gpt2")
	fmt.Println("   ├─ gpt-image-2-plus (默认, 需设置 THREEOTWO_API_KEY)")
	fmt.Println("   ├─ gpt-image-1")
	fmt.Println("   ├─ gpt-image-1-mini")
	fmt.Println("   └─ gpt-image-1.5")
	fmt.Println("   环境变量 GPT2_ENDPOINT 可自定义 API 地址 (默认: https://api.302.ai/v1/images/generations)")
	fmt.Println("  Provider: prompt")
	fmt.Println("   └─ (输出 prompt 而不调用 API，可通过 --prompt-only 或 IMAGE_PROVIDER=prompt 启用)")
}
