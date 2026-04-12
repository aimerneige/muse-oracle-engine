package utils

import (
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// CodeBlock 表示一个 Markdown 代码块
type CodeBlock struct {
	Language string // 语言标识符（如 "markdown", "json"）
	Content  string // 代码块内容
}

// ExtractCodeBlocks 从 Markdown 文本中提取所有代码块
// 使用 goldmark 解析器确保准确提取，处理各种边缘情况：
// - 多个代码块
// - 代码块内包含 ``` 的情况
// - 不完整的代码块（自动忽略）
// - 带或不带语言标识符的代码块
func ExtractCodeBlocks(markdown string) []CodeBlock {
	var blocks []CodeBlock

	source := []byte(markdown)
	md := goldmark.New()
	reader := text.NewReader(source)
	doc := md.Parser().Parse(reader)

	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}

		if fencedCodeBlock, ok := n.(*ast.FencedCodeBlock); ok {
			// 提取语言标识符
			language := string(fencedCodeBlock.Language(source))

			// 提取代码内容
			var contentBuilder strings.Builder
			lines := fencedCodeBlock.Lines()
			for i := 0; i < lines.Len(); i++ {
				line := lines.At(i)
				contentBuilder.Write(line.Value(source))
			}

			blocks = append(blocks, CodeBlock{
				Language: language,
				Content:  strings.TrimSuffix(contentBuilder.String(), "\n"),
			})
		}

		return ast.WalkContinue, nil
	})

	return blocks
}

// ExtractCodeBlocksWithFilter 提取指定语言的代码块
func ExtractCodeBlocksWithFilter(markdown string, language string) []CodeBlock {
	blocks := ExtractCodeBlocks(markdown)
	var filtered []CodeBlock
	for _, block := range blocks {
		if block.Language == language {
			filtered = append(filtered, block)
		}
	}
	return filtered
}

// ExtractFirstCodeBlock 提取第一个代码块
func ExtractFirstCodeBlock(markdown string) *CodeBlock {
	blocks := ExtractCodeBlocks(markdown)
	if len(blocks) == 0 {
		return nil
	}
	return &blocks[0]
}
