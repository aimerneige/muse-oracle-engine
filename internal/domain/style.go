package domain

// ComicStyle represents a visual style for comic generation.
type ComicStyle string

const (
	StyleAnime3DEngine    ComicStyle = "anime_3d_engine"
	StyleChibiFigure      ComicStyle = "chibi_figure"
	StyleFigmaFigure      ComicStyle = "figma_figure"
	StyleWaterColor       ComicStyle = "watercolor"
	StyleCrayonDoodle     ComicStyle = "crayon_doodle"
	StylePapercraftCutout ComicStyle = "papercraft_cutout"
	StylePixelArt         ComicStyle = "pixel_art"
	StylePlushPhotography ComicStyle = "plush_photography"
	StyleRetroPopComic    ComicStyle = "retro_pop_comic"
)

// AllStyles returns all available comic styles.
func AllStyles() []ComicStyle {
	styles := make([]ComicStyle, 0, len(StyleRegistry))
	for id := range StyleRegistry {
		styles = append(styles, id)
	}
	return styles
}

// StyleMeta contains display metadata for a comic style.
type StyleMeta struct {
	ID          ComicStyle `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	TemplateKey string     `json:"-"` // filename key for prompt template lookup
}

// StyleRegistry maps style IDs to their metadata.
var StyleRegistry = map[ComicStyle]StyleMeta{
	StyleAnime3DEngine: {
		ID:          StyleAnime3DEngine,
		Name:        "动漫 3D 引擎风格",
		Description: "二次元 3D 游戏 CG 风格，角色呈现 MMD/Unity 模型质感、Toon Shader、硬边阴影与边缘光；适合干净数字场景和光效。",
		TemplateKey: "anime_3d_engine",
	},
	StyleChibiFigure: {
		ID:          StyleChibiFigure,
		Name:        "Q版粘土人风格",
		Description: "Q版粘土人/盲盒手办风格，2.5-3.5 头身、哑光 PVC 与软胶头发；分镜适合微缩场景、移轴摄影和可爱夸张表演。",
		TemplateKey: "chibi_figure",
	},
	StyleFigmaFigure: {
		ID:          StyleFigmaFigure,
		Name:        "Figma 手办风格",
		Description: "Figma/PVC 可动手办微距摄影风格，强调硬质塑料头发、涂装衣物、机械关节和生硬摆姿；适合微缩道具场景。",
		TemplateKey: "figma_figure",
	},
	StyleWaterColor: {
		ID:          StyleWaterColor,
		Name:        "水彩风格",
		Description: "清新水彩绘本风格，柔和角色、纸张颗粒、水渍晕染和通透低饱和色彩；分镜适合留白、轻背景和治愈氛围。",
		TemplateKey: "watercolor",
	},
	StyleCrayonDoodle: {
		ID:          StyleCrayonDoodle,
		Name:        "粉彩蜡笔涂鸦风格",
		Description: "粉彩蜡笔涂鸦风格，极简人物、粗糙纸张颗粒、未涂满色块和随性线条；分镜适合夸张表情、童趣或脱线喜剧。",
		TemplateKey: "crayon_doodle",
	},
	StylePapercraftCutout: {
		ID:          StylePapercraftCutout,
		Name:        "立体剪纸拼贴风格",
		Description: "立体剪纸拼贴风格，角色与场景由多层卡纸裁切拼贴而成，强调纸张纤维、裁切边缘和 2.5D 投影。",
		TemplateKey: "papercraft_cutout",
	},
	StylePixelArt: {
		ID:          StylePixelArt,
		Name:        "复古像素风格",
		Description: "16-bit/32-bit 复古像素艺术风格，画面由清晰方形像素、限制调色板和抖动阴影构成；适合游戏场景切片构图。",
		TemplateKey: "pixel_art",
	},
	StylePlushPhotography: {
		ID:          StylePlushPhotography,
		Name:        "毛绒娃娃微距摄影风格",
		Description: "毛绒娃娃微距实拍风格，角色呈现短小柔软布偶形体、刺绣五官、不织布头发与细密绒毛；适合温暖布光和浅景深。",
		TemplateKey: "plush_photography",
	},
	StyleRetroPopComic: {
		ID:          StyleRetroPopComic,
		Name:        "美漫波普艺术风格",
		Description: "复古美漫波普风格，粗黑墨线、高饱和原色、半调网点和撞色背景；分镜适合戏剧化表情、力量感动作和爆炸特效。",
		TemplateKey: "retro_pop_comic",
	},
}

// IsValid checks if the style is a known style.
func (s ComicStyle) IsValid() bool {
	_, ok := StyleRegistry[s]
	return ok
}
