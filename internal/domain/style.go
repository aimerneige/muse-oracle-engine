package domain

// ComicStyle represents a visual style for comic generation.
type ComicStyle string

const (
	StyleChibiFigure ComicStyle = "chibi_figure"
	StyleFigmaFigure ComicStyle = "figma_figure"
	StyleWaterColor  ComicStyle = "watercolor"
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
}

// IsValid checks if the style is a known style.
func (s ComicStyle) IsValid() bool {
	_, ok := StyleRegistry[s]
	return ok
}
