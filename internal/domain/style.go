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
		Description: "MMD / Unity / Toon Shader 风格，3D 动漫渲染与赛璐璐质感",
		TemplateKey: "anime_3d_engine",
	},
	StyleChibiFigure: {
		ID:          StyleChibiFigure,
		Name:        "Q版粘土人风格",
		Description: "Chibi / Nendoroid 风格，2.5~3.5 头身比，哑光 PVC 质感",
		TemplateKey: "chibi_figure",
	},
	StyleFigmaFigure: {
		ID:          StyleFigmaFigure,
		Name:        "Figma 手办风格",
		Description: "Figma 可动手办风格，精致关节与涂装细节",
		TemplateKey: "figma_figure",
	},
	StyleWaterColor: {
		ID:          StyleWaterColor,
		Name:        "水彩风格",
		Description: "水彩画风格，柔和色调与纸张质感",
		TemplateKey: "watercolor",
	},
	StyleCrayonDoodle: {
		ID:          StyleCrayonDoodle,
		Name:        "粉彩蜡笔涂鸦风格",
		Description: "蜡笔与粉彩涂鸦风格，粗糙纸张肌理与随性笔触",
		TemplateKey: "crayon_doodle",
	},
	StylePapercraftCutout: {
		ID:          StylePapercraftCutout,
		Name:        "立体剪纸拼贴风格",
		Description: "多层卡纸剪纸拼贴风格，纸张纤维与 2.5D 投影",
		TemplateKey: "papercraft_cutout",
	},
	StylePixelArt: {
		ID:          StylePixelArt,
		Name:        "复古像素风格",
		Description: "16-bit / 32-bit 像素艺术风格，点阵字体与像素抖动",
		TemplateKey: "pixel_art",
	},
	StylePlushPhotography: {
		ID:          StylePlushPhotography,
		Name:        "毛绒娃娃微距摄影风格",
		Description: "毛绒玩偶实拍风格，刺绣五官、布料绒毛与柔和景深",
		TemplateKey: "plush_photography",
	},
	StyleRetroPopComic: {
		ID:          StyleRetroPopComic,
		Name:        "美漫波普艺术风格",
		Description: "复古美漫波普风格，粗黑墨线、高饱和撞色与半调网点",
		TemplateKey: "retro_pop_comic",
	},
}

// IsValid checks if the style is a known style.
func (s ComicStyle) IsValid() bool {
	_, ok := StyleRegistry[s]
	return ok
}
