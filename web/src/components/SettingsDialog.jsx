import { useState } from "react";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import { useProject } from "../store/ProjectStore.jsx";
import { configured } from "../store/selectors.js";
import { keys, writeJSON } from "../engine/storage.js";
import Dialog from "./Dialog.jsx";
export default function SettingsDialog({ data, onClose, onError }) {
  const { settings, update } = useProject();
  const { t } = useLocale();
  const [draft, setDraft] = useState(settings);
  const [show, setShow] = useState({});
  const field = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Dialog title={t("settings")} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const clean = Object.fromEntries(
              Object.entries(draft).map(([k, v]) => [
                k,
                typeof v === "string" ? v.trim() : v,
              ]),
            );
            writeJSON(keys.settings, clean);
            update({ settings: clean });
            onClose();
          } catch (error) {
            onError(error);
          }
        }}
      >
        <div className="settings-groups">
          {["llm", "image"].map((kind) => (
            <fieldset key={kind}>
              <legend>
                {t(kind === "llm" ? "textModel" : "imageModel")} ·{" "}
                {t(configured(draft, kind) ? "configured" : "unconfigured")}
              </legend>
              <label>
                {t("provider")}
                <select
                  value={draft[kind + "Provider"]}
                  onChange={(e) => {
                    const provider = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      [kind + "Provider"]: provider,
                      [kind + "UseOfficialApi"]: provider === "gemini",
                      [kind + "Endpoint"]:
                        data.defaultEndpoints[provider][kind],
                      [kind + "Model"]: (kind === "llm"
                        ? data.llmModels
                        : data.imageModels)[provider][0],
                    }));
                  }}
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI-compatible</option>
                </select>
              </label>
              {draft[kind + "Provider"] === "gemini" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={draft[kind + "UseOfficialApi"]}
                    onChange={(e) =>
                      field(kind + "UseOfficialApi", e.target.checked)
                    }
                  />
                  {t("official")}
                </label>
              )}
              {!(
                draft[kind + "Provider"] === "gemini" &&
                draft[kind + "UseOfficialApi"]
              ) && (
                <label>
                  {t("endpoint")}
                  <input
                    type="url"
                    value={draft[kind + "Endpoint"]}
                    onChange={(e) => field(kind + "Endpoint", e.target.value)}
                  />
                </label>
              )}
              <label>
                {t("apiKey")}
                <input
                  type={show[kind] ? "text" : "password"}
                  autoComplete="off"
                  value={draft[kind + "ApiKey"]}
                  onChange={(e) => field(kind + "ApiKey", e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() => setShow((s) => ({ ...s, [kind]: !s[kind] }))}
              >
                {t(show[kind] ? "hide" : "show")}
              </button>
              <label>
                {t("model")}
                <input
                  list={kind + "-models"}
                  value={draft[kind + "Model"]}
                  onChange={(e) => field(kind + "Model", e.target.value)}
                />
                <datalist id={kind + "-models"}>
                  {(kind === "llm" ? data.llmModels : data.imageModels)[
                    draft[kind + "Provider"]
                  ].map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
              {kind === "image" && draft.imageProvider === "gemini" && (
                <label>
                  {t("imageSize")}
                  <select
                    value={draft.geminiImageSize}
                    onChange={(e) => field("geminiImageSize", e.target.value)}
                  >
                    {(
                      data.imageModelSizes?.[draft.imageModel] ||
                      data.imageSizes
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
          ))}
        </div>
        <p>{t("security")}</p>
        <footer className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="primary" type="submit">
            {t("save")}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
