export function upsertCharacterSettings(current, replacements) {
  var byID = {};
  current.concat(replacements).forEach(function (character) {
    byID[character.series + "/" + character.id] = character;
  });
  return Object.keys(byID)
    .sort()
    .map(function (fullID) {
      return byID[fullID];
    });
}

export function buildCharacterSetting(characters) {
  var lines = ["> 注：此处设定不可变的生理特征，后续分镜中不再赘述"];
  characters.forEach(function (c) {
    lines.push("");
    lines.push("- **" + c.name + "**：");
    lines.push(
      "  - **发型与发色**：" +
        c.appearance.hair_style +
        " / " +
        c.appearance.hair_color,
    );
    lines.push(
      "  - **眼型与瞳色**：" +
        c.appearance.eye_shape +
        " / " +
        c.appearance.eye_color,
    );
    lines.push(
      "  - **身高与身材**：" +
        c.appearance.height +
        " / " +
        c.appearance.body_type,
    );
    lines.push("  - **其他特征**：" + c.appearance.other);
  });
  return lines.join("\n");
}

export function loadCharacterSettings(characters) {
  if (!Array.isArray(characters)) {
    return [];
  }
  return characters.map(normalizeCharacterSetting).filter(Boolean);
}

export function normalizeCharacterSetting(character) {
  if (
    !character ||
    typeof character !== "object" ||
    !character.appearance ||
    typeof character.appearance !== "object"
  ) {
    return null;
  }
  var required = [
    character.id,
    character.name,
    character.series,
    character.personality,
    character.appearance.hair_style,
    character.appearance.hair_color,
    character.appearance.eye_shape,
    character.appearance.eye_color,
    character.appearance.height,
    character.appearance.body_type,
    character.appearance.other,
  ];
  if (
    required.some(function (value) {
      return typeof value !== "string" || !value.trim();
    })
  ) {
    return null;
  }
  if (
    !isValidCharacterID(character.series) ||
    !isValidCharacterID(character.id)
  ) {
    return null;
  }
  return {
    id: character.id.trim(),
    name: character.name.trim(),
    name_en:
      typeof character.name_en === "string" ? character.name_en.trim() : "",
    series: character.series.trim(),
    appearance: {
      hair_style: character.appearance.hair_style.trim(),
      hair_color: character.appearance.hair_color.trim(),
      eye_shape: character.appearance.eye_shape.trim(),
      eye_color: character.appearance.eye_color.trim(),
      height: character.appearance.height.trim(),
      body_type: character.appearance.body_type.trim(),
      other: character.appearance.other.trim(),
    },
    personality: character.personality.trim(),
    tags: Array.isArray(character.tags)
      ? character.tags
          .filter(function (tag) {
            return typeof tag === "string" && tag.trim();
          })
          .map(function (tag) {
            return tag.trim();
          })
      : [],
  };
}

export function isValidCharacterID(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
