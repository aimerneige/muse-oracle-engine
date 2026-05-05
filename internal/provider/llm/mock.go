package llm

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// MockProvider is an LLM provider that returns pre-defined mock data
// for testing the frontend flow without calling any AI API.
type MockProvider struct{}

// NewMockProvider creates a new mock LLM provider.
func NewMockProvider() *MockProvider {
	return &MockProvider{}
}

// mockStoryboardResponse is the pre-defined mock data that mimics real LLM output.
// It contains fenced code blocks that will be parsed as storyboard panels by StoryService.
const mockStoryboardResponse = "# LoveLive! 漫画分镜脚本 - Mock 数据\n\n" +
	"以下是本次漫画的分镜设计，共 **4 个画面**：\n\n" +
	"```markdown\n" +
	"**Panel 1 - 开场**\n" +
	"- **场景**: 音乃木坂学院的清晨，樱花飘落的校门口\n" +
	"- **画面描述**: 阳光透过樱花树梢洒下斑驳光影，少女们三三两两走向校门。画面中心是一位元气满满的橙发少女（高坂穗乃果），她正兴奋地向朋友们挥手，双眸闪烁着梦想的光芒。背景中可以看到学校标志性的红色拱门和飘落的花瓣。\n" +
	"- **角色表情**: 穗乃果大大的笑容，充满期待与活力；海未略显无奈但温柔的微笑；小鸟温柔注视着好友。\n" +
	"- **构图**: 中景镜头，略微仰视角度突出主角的活力感。樱花花瓣作为前景虚化增加层次。\n" +
	"```\n\n" +
	"```markdown\n" +
	"**Panel 2 - 冲突**\n" +
	"- **场景**: 学院内的活动室，午后阳光从窗户斜射入内\n" +
	"- **画面描述**: 活动室的白板上写着\"学园偶像计划\"几个大字，周围散落着策划资料。穗乃果双手撑在桌子上，表情认真而坚定地发表着自己的想法。海未抱着双臂若有所思，小鸟则拿着笔记本认真记录。桌上放着三人份的奶茶和点心。\n" +
	"- **角色表情**: 穗乃果眼神坚定，嘴角带着自信的弧度；海未眉头微蹙但在认真思考；小鸟专注记录偶尔点头。\n" +
	"- **构图**: 室内近景，桌面视角略微俯视，展现讨论氛围。暖色调光线营造温馨感。\n" +
	"```\n\n" +
	"```markdown\n" +
	"**Panel 3 - 高潮**\n" +
	"- **场景**: 学校的露天舞台，傍晚时分的天空染上绚丽的晚霞\n" +
	"- **画面描述**: 三位少女站在舞台中央，聚光灯从上方打下来形成神圣的光柱效应。穗乃果站在最前方张开双臂，仿佛要拥抱整个世界；海未和小鸟在她身后两侧摆出舞蹈姿势。观众席的剪影隐约可见，荧光棒的光点如繁星般闪烁。\n" +
	"- **角色表情**: 穗乃果洋溢着纯粹的喜悦与感动，眼角泛着泪光；海未露出难得的绽放笑容；小鸟温柔而坚定的眼神望向远方。\n" +
	"- **构图**: 广角舞台全景，低角度仰拍营造史诗感。晚霞渐变色彩（橙->紫->深蓝）作为背景烘托情绪高潮。\n" +
	"```\n\n" +
	"```markdown\n" +
	"**Panel 4 - 结尾**\n" +
	"- **场景**: 夜晚的学校天台，城市夜景灯火辉煌\n" +
	"- **画面描述**: 三个身影并肩坐在天台边缘，背对着观众眺望远方的城市灯火。夜风中她们的发丝轻轻飘动，手中各自握着一瓶饮料。远处的城市天际线与星光交相辉映，一轮明月挂在天空角落。\n" +
	"- **角色表情**: 虽然看不到正面，但从放松的肩部线条和微微靠在一起的姿态可以感受到彼此间的羁绊与满足感。穗乃果的头轻轻倚在海未肩上，小鸟哼着小曲。\n" +
	"- **构图**: 剪影式背影构图，强调\"在一起\"的主题。冷色调夜景与远处暖色灯光形成对比，余韵悠长。\n" +
	"```\n\n" +
	"---\n" +
	"*以上为 Mock 模式生成的示例数据，用于前端流程测试。*\n\n" +
	"<!-- MOCK_MODE: true -->\n"

// GenerateText returns mock storyboard data with code blocks that mimic
// real LLM output. The response contains multiple fenced code blocks,
// each representing a storyboard panel.
func (m *MockProvider) GenerateText(_ context.Context, prompt string) (string, error) {
	if strings.Contains(prompt, "自动化长篇漫画剧情梗概引擎") {
		return mockLongMangaOutlineResponse(prompt), nil
	}
	if strings.Contains(prompt, "自动化长篇漫画单话分镜脚本引擎") {
		return mockLongMangaEpisodeResponse(prompt), nil
	}
	return mockStoryboardResponse, nil
}

// GenerateTextWithHistory returns the same mock data (ignores history).
func (m *MockProvider) GenerateTextWithHistory(_ context.Context, history History) (string, error) {
	_ = history
	return mockStoryboardResponse, nil
}

// Name returns the provider name.
func (m *MockProvider) Name() string {
	return "mock (test mode)"
}

func mockLongMangaOutlineResponse(prompt string) string {
	ids := mockCandidateIDs(prompt)
	if len(ids) == 0 {
		ids = []string{"lovelive/honoka"}
	}
	characterIDs := mockJSONStringArray(ids)
	return "```json\n" +
		"{\n" +
		"  \"total_episodes\": 2,\n" +
		"  \"episodes\": [\n" +
		"    {\"episode\": 1, \"title\": \"晨间约定\", \"summary\": \"主角们在清晨集合，发现今天的计划出现了意外阻碍。\", \"character_ids\": " + characterIDs + "},\n" +
		"    {\"episode\": 2, \"title\": \"黄昏回应\", \"summary\": \"众人把意外转化为新的舞台灵感，并在黄昏完成一次小小的约定。\", \"character_ids\": " + characterIDs + "}\n" +
		"  ]\n" +
		"}\n" +
		"```"
}

func mockLongMangaEpisodeResponse(prompt string) string {
	ids := mockAvailableCharacterIDs(prompt)
	if len(ids) == 0 {
		ids = []string{"lovelive/honoka"}
	}
	episode := mockRequestedEpisode(prompt)
	characterIDs := mockJSONStringArray(ids)
	return "```json\n" +
		"{\n" +
		fmt.Sprintf("  \"episode\": %d,\n", episode) +
		"  \"title\": \"晨间约定\",\n" +
		"  \"summary\": \"主角们在清晨集合，发现今天的计划出现了意外阻碍。\",\n" +
		"  \"character_ids\": " + characterIDs + ",\n" +
		"  \"panels\": [\n" +
		"    {\"index\": 1, \"character_ids\": " + characterIDs + ", \"content\": \"##### 第1格\\n* **【构图与景别】**：中景 / 平视 / 稳定构图\\n* **【可见场景与光影】**：清晨校门口，柔和阳光从画面左侧照入。\\n* **【动态视觉与定格姿势】**：\\n  - [画面中心] 角色：[**当前完整穿搭**：整洁校服与书包] + [抬手打招呼] + [明亮笑容]\\n* **【对白与气泡】**：\\n  - [画面中心] 角色 (普通圆形气泡)：\\\"早上好！\\\"\\n* **【漫符与特效】**：キラキラ\"},\n" +
		"    {\"index\": 2, \"character_ids\": " + characterIDs + ", \"content\": \"##### 第2格\\n* **【构图与景别】**：近景 / 平视 / 轻微推近\\n* **【可见场景与光影】**：公告栏前，纸张边缘被晨光照亮。\\n* **【动态视觉与定格姿势】**：\\n  - [画面左侧] 角色：[**当前完整穿搭**：整洁校服与书包] + [指向公告] + [惊讶表情]\\n* **【对白与气泡】**：\\n  - [画面左侧] 角色 (尖角气泡)：\\\"咦？计划变了？\\\"\\n* **【漫符与特效】**：ガーン\"},\n" +
		"    {\"index\": 3, \"character_ids\": " + characterIDs + ", \"content\": \"##### 第3格\\n* **【构图与景别】**：全景 / 平视 / 横向构图\\n* **【可见场景与光影】**：走廊延伸到远处，窗外光线形成明亮条纹。\\n* **【动态视觉与定格姿势】**：\\n  - [画面中心] 角色：[**当前完整穿搭**：整洁校服与书包] + [快步向前] + [认真表情]\\n* **【对白与气泡】**：\\n  - [画面中心] 角色 (普通圆形气泡)：\\\"那就换个办法。\\\"\\n* **【漫符与特效】**：タッタッ\"},\n" +
		"    {\"index\": 4, \"character_ids\": " + characterIDs + ", \"content\": \"##### 第4格\\n* **【构图与景别】**：中景 / 逆光 / 收束构图\\n* **【可见场景与光影】**：活动室门口，门缝透出温暖光线。\\n* **【动态视觉与定格姿势】**：\\n  - [画面中心] 角色：[**当前完整穿搭**：整洁校服与书包] + [推开门] + [期待表情]\\n* **【对白与气泡】**：\\n  - [画面中心] 角色 (小圆形气泡)：\\\"开始吧。\\\"\\n* **【漫符与特效】**：カチャ\"}\n" +
		"  ]\n" +
		"}\n" +
		"```"
}

func mockRequestedEpisode(prompt string) int {
	re := regexp.MustCompile(`"episode": ([0-9]+)`)
	matches := re.FindStringSubmatch(prompt)
	if len(matches) != 2 {
		return 1
	}
	if matches[1] == "2" {
		return 2
	}
	return 1
}

func mockCandidateIDs(prompt string) []string {
	re := regexp.MustCompile("(?m)^- `([^`]+)`：")
	return mockRegexpMatches(re, prompt)
}

func mockAvailableCharacterIDs(prompt string) []string {
	re := regexp.MustCompile("(?m)^### `([^`]+)` ")
	return mockRegexpMatches(re, prompt)
}

func mockRegexpMatches(re *regexp.Regexp, prompt string) []string {
	matches := re.FindAllStringSubmatch(prompt, -1)
	ids := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) == 2 {
			ids = append(ids, match[1])
		}
	}
	return ids
}

func mockJSONStringArray(values []string) string {
	quoted := make([]string, 0, len(values))
	for _, value := range values {
		quoted = append(quoted, fmt.Sprintf("%q", value))
	}
	return "[" + strings.Join(quoted, ", ") + "]"
}

var _ = fmt.Sprintf("%T implements Provider", (*MockProvider)(nil))
