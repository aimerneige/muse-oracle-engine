package domain

// CharacterAppearance describes the immutable physical traits of a character.
type CharacterAppearance struct {
	HairStyle string `json:"hair_style" yaml:"hair_style"` // e.g. "偏分刘海，侧马尾（扎在左侧），发梢微卷"
	HairColor string `json:"hair_color" yaml:"hair_color"` // e.g. "姜黄色 / 橙棕色"
	EyeShape  string `json:"eye_shape" yaml:"eye_shape"`   // e.g. "大圆眼，明亮有神"
	EyeColor  string `json:"eye_color" yaml:"eye_color"`   // e.g. "蓝色"
	Height    string `json:"height" yaml:"height"`          // e.g. "157cm"
	BodyType  string `json:"body_type" yaml:"body_type"`    // e.g. "标准偶像体型，略显活泼"
	Other     string `json:"other" yaml:"other"`            // e.g. skin tone, scars, animal ears, etc.
}

// Character represents a known anime character with pre-defined appearance and personality.
type Character struct {
	ID          string              `json:"id" yaml:"id"`                   // unique identifier, e.g. "honoka"
	Name        string              `json:"name" yaml:"name"`               // display name, e.g. "高坂穗乃果"
	NameEN      string              `json:"name_en" yaml:"name_en"`         // English name, e.g. "Kousaka Honoka"
	Series      string              `json:"series" yaml:"series"`           // series ID, e.g. "lovelive"
	Appearance  CharacterAppearance `json:"appearance" yaml:"appearance"`   // visual traits
	Personality string              `json:"personality" yaml:"personality"` // personality description
	Tags        []string            `json:"tags" yaml:"tags"`               // e.g. ["leader", "energetic"]
}

// Series represents an anime series that characters belong to.
type Series struct {
	ID     string `json:"id" yaml:"id"`         // unique identifier, e.g. "lovelive"
	Name   string `json:"name" yaml:"name"`     // display name, e.g. "LoveLive!"
	NameEN string `json:"name_en" yaml:"name_en"` // English name
}
