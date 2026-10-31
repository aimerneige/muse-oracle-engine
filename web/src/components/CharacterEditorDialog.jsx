import { useState } from "react";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import { useProject } from "../store/ProjectStore.jsx";
import {
  normalizeCharacterSetting,
  upsertCharacterSettings,
} from "../engine/characters.js";
import { keys, writeJSON } from "../engine/storage.js";
import Dialog from "./Dialog.jsx";
export default function CharacterEditorDialog({ character, data, onClose }) {
  const { characterSettings, update } = useProject();
  const { t } = useLocale();
  const [draft, setDraft] = useState(
    character || {
      id: "",
      series: "",
      name: "",
      name_en: "",
      personality: "",
      tags: [],
      appearance: {
        hair_style: "",
        hair_color: "",
        eye_shape: "",
        eye_color: "",
        height: "",
        body_type: "",
        other: "",
      },
    },
  );
  const [error, setError] = useState("");
  return (
    <Dialog title={t(character ? "edit" : "add")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const normalized = normalizeCharacterSetting(draft);
          if (
            !normalized ||
            (!character &&
              upsertCharacterSettings(data.characters, characterSettings).some(
                (c) => c.id === normalized.id && c.series === normalized.series,
              ))
          ) {
            setError(t("invalidCharacter"));
            return;
          }
          try {
            const next = upsertCharacterSettings(characterSettings, [
              normalized,
            ]);
            writeJSON(keys.characters, next);
            update({ characterSettings: next });
            onClose();
          } catch (error) {
            setError(error.message);
          }
        }}
      >
        <div className="editor-grid">
          {[
            "series",
            "id",
            "name",
            "nameEn",
            "personality",
            ...Object.keys(draft.appearance),
          ].map((key) => {
            const actual = key === "nameEn" ? "name_en" : key;
            const appearance = actual in draft.appearance;
            return (
              <label key={key}>
                {t(key)}
                <input
                  required={actual !== "name_en"}
                  disabled={!!character && ["id", "series"].includes(key)}
                  value={appearance ? draft.appearance[actual] : draft[actual]}
                  onChange={(e) =>
                    setDraft((d) =>
                      appearance
                        ? {
                            ...d,
                            appearance: {
                              ...d.appearance,
                              [actual]: e.target.value,
                            },
                          }
                        : { ...d, [actual]: e.target.value },
                    )
                  }
                />
              </label>
            );
          })}
          <label>
            {t("tags")}
            <input
              value={draft.tags.join(", ")}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  tags: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }))
              }
            />
          </label>
        </div>
        <p className="error" role="alert">
          {error}
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="primary">{t("save")}</button>
        </div>
      </form>
    </Dialog>
  );
}
