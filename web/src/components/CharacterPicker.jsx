import { useState } from "react";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import { useProject } from "../store/ProjectStore.jsx";
import { upsertCharacterSettings } from "../engine/characters.js";
const hairColors = [
  ["粉", "pink", "#eeb3c7"],
  ["红", "red", "#d68b86"],
  ["蓝", "blue", "#9bb9d4"],
  ["紫", "purple", "#b6a2cc"],
  ["金", "blond", "#e0cf8e"],
  ["橙", "orange", "#e7b686"],
  ["棕", "brown", "#bfaa97"],
  ["黑", "black", "#9caaa6"],
  ["银", "silver", "#c6cdd1"],
];
const hairColor = (character) =>
  hairColors.find(
    ([zh, en]) =>
      character.appearance.hair_color.includes(zh) ||
      character.appearance.hair_color.toLowerCase().includes(en),
  )?.[2];
export default function CharacterPicker({ data, onEdit }) {
  const { project, characterSettings, patchProject, job } = useProject();
  const { t, name } = useLocale();
  const [series, setSeries] = useState("");
  const [query, setQuery] = useState("");
  const all = upsertCharacterSettings(data.characters, characterSettings);
  const toggle = (id) =>
    patchProject({
      characterIds: project.characterIds.includes(id)
        ? project.characterIds.filter((i) => i !== id)
        : [...project.characterIds, id],
    });
  return (
    <section>
      <h2>{t("characters")}</h2>
      <div className="selected-tray" aria-label={t("selected")}>
        <strong>
          {t("selected")} · {project.characterIds.length}
        </strong>
        {project.characterIds.map((id) => (
          <button key={id} disabled={!!job} onClick={() => toggle(id)}>
            {name(all.find((c) => c.series + "/" + c.id === id) || { id })} ×
          </button>
        ))}
      </div>
      <div className="filters">
        <label>
          {t("allSeries")}
          <select value={series} onChange={(e) => setSeries(e.target.value)}>
            <option value="">{t("allSeries")}</option>
            {[...new Set(all.map((c) => c.series))].map((id) => (
              <option key={id} value={id}>
                {name(data.series.find((s) => s.id === id) || { id })}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("search")}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="character-grid">
        {all
          .filter(
            (c) =>
              (!series || c.series === series) &&
              [c.name, c.name_en, c.id]
                .join(" ")
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .map((c) => {
            const id = c.series + "/" + c.id;
            const selected = project.characterIds.includes(id);
            return (
              <div key={id} className="character-entry">
                <button
                  className="character-card"
                  aria-pressed={selected}
                  disabled={!!job}
                  onClick={() => toggle(id)}
                >
                  <span className="avatar" style={{ background: hairColor(c) }}>
                    {name(c).slice(0, 1)}
                  </span>
                  <span>
                    <strong>{name(c)}</strong>
                    <small>
                      {name(
                        data.series.find((s) => s.id === c.series) || {
                          id: c.series,
                        },
                      )}
                    </small>
                  </span>
                  <span>{selected ? "✓" : "+"}</span>
                </button>
                <button
                  className="edit-character"
                  onClick={() => onEdit(c)}
                  aria-label={t("edit") + " " + name(c)}
                >
                  ✎
                </button>
              </div>
            );
          })}
      </div>
    </section>
  );
}
