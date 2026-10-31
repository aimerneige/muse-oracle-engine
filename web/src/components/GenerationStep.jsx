import { useEffect, useState } from "react";
import { useProject } from "../store/ProjectStore.jsx";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import {
  generationPrompt,
  parseResult,
  promptPatch,
} from "../store/actions.js";
import { configured } from "../store/selectors.js";
import { readJSON, writeJSON } from "../engine/storage.js";

export default function GenerationStep({
  stage,
  episode,
  data,
  onSettings,
  onCopy,
  onGenerate,
}) {
  const store = useProject();
  const { project, settings, job, ui, update, get } = store;
  const { t } = useLocale();
  const key = stage + ":" + (episode || "");
  const raw =
    stage === "outline"
      ? project.rawLongOutline
      : project.storyMode === "standard"
        ? project.rawStoryboard
        : project.storyMode === "long"
          ? project.rawLongBatchStoryboard
          : project.longEpisodeRaws.find((e) => e.episode === episode)?.raw ||
            "";
  const ready = configured(settings, "llm");
  const [mode, setMode] = useState(() =>
    ready ? readJSON("lovelive-engine-web-generation-mode", "ai") : "manual",
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [revision, setRevision] = useState(0);
  const count = stage === "outline"
    ? (project.longOutline?.episodes.length || 0) * 4
    : project.storyMode === "four"
      ? project.longEpisodes.find(e => e.episode === episode)?.panels.length || 0
      : project.panels.length * 4;
  const parsed = (success || !!raw && count > 0) && !error && !ui.parseErrors?.[key] && !ui.error && !job;
  useEffect(() => {
    if (parsed) setExpanded(false);
  }, [raw, job]);
  const prompt = generationPrompt(
    data,
    project,
    store.characterSettings,
    stage,
    episode,
  );
  useEffect(() => {
    store.patchProject(promptPatch(get().project, stage, episode, prompt));
  }, [prompt]);
  useEffect(() => {
    update({
      ui: {
        ...get().ui,
        generationModes: { ...get().ui.generationModes, [key]: mode },
      },
    });
  }, [mode]);
  const changeRaw = (value) => {
    const p = get().project;
    store.patchProject(
      stage === "outline"
        ? { rawLongOutline: value }
        : p.storyMode === "standard"
          ? { rawStoryboard: value }
          : p.storyMode === "long"
            ? { rawLongBatchStoryboard: value }
            : {
                longEpisodeRaws: [
                  ...p.longEpisodeRaws.filter((e) => e.episode !== episode),
                  { episode, raw: value },
                ],
              },
    );
    update({
      ui: {
        ...get().ui,
        parseErrors: { ...get().ui.parseErrors, [key]: t("finishParse") },
      },
    });
    setSuccess(false);
    setRevision((r) => r + 1);
  };
  useEffect(() => {
    if (!revision || job) return;
    const timer = setTimeout(() => {
      if (!raw.trim()) {
        setError("");
        setSuccess(false);
        return;
      }
      try {
        update({
          project: parseResult(get().project, stage, raw, episode),
          ui: {
            ...get().ui,
            error: "",
            parseErrors: { ...get().ui.parseErrors, [key]: "" },
          },
        });
        setSuccess(true);
        setExpanded(false);
        setError("");
      } catch (e) {
        setError(e.message);
        update({
          ui: {
            ...get().ui,
            parseErrors: { ...get().ui.parseErrors, [key]: e.message },
          },
        });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [raw, revision, job]);
  const generate = () => {
    if (raw && !overwrite) {
      setOverwrite(true);
      return;
    }
    setOverwrite(false);
    onGenerate(stage, episode, undefined, true);
  };
  return (
    <section className="generation-block" data-generation={key}>
      {parsed && !expanded ? <div className="generation-summary">
        <span className="success" aria-live="polite">✓ {t("parsed")} · {count} {t("panelUnit")}</span>
        <button onClick={() => { setExpanded(true); setMode("manual"); }}>{t("reopenRaw")}</button>
        <button onClick={() => { setExpanded(true); setMode(ready ? "ai" : "manual"); }}>{t("regenerate")}</button>
      </div> : <>
      <div className="segmented" aria-label={t("generate")}>
        <button
          aria-pressed={mode === "ai"}
          onClick={() => {
            if (!ready) {
              onSettings();
              return;
            }
            setMode("ai");
            writeJSON("lovelive-engine-web-generation-mode", "ai");
          }}
        >
          {t("ai")}
          {!ready && " · " + t("notConfigured")}
        </button>
        <button
          aria-pressed={mode === "manual"}
          onClick={() => {
            setMode("manual");
            writeJSON("lovelive-engine-web-generation-mode", "manual");
          }}
        >
          {t("manual")}
        </button>
      </div>
      {mode === "manual" ? (
        <>
          <p>{t("manualHelp")}</p>
          <button disabled={!!job} onClick={() => onCopy(prompt)}>
            {t("copy")}
          </button>
          <details>
            <summary>{t("preview")}</summary>
            <textarea
              readOnly
              rows={7}
              aria-label={t("preview")}
              value={prompt}
            />
          </details>
          <label>
            {t("paste")}
            {episode ? " · " + t("episode", { n: episode }) : ""}
            <textarea
              rows={6}
              value={raw}
              onChange={(e) => changeRaw(e.target.value)}
              disabled={!!job}
              spellCheck="false"
            />
          </label>
        </>
      ) : (
        <>
          <button disabled={!!job || !ready} onClick={generate}>
            {t(error ? "retry" : "generate")}
          </button>
          {(overwrite || ui.overwriteRequest === key) && (
            <div className="inline-confirm">
              {t("overwrite")}
              <button
                onClick={() => {
                  setOverwrite(false);
                  onGenerate(stage, episode, undefined, true);
                }}
              >
                {t("confirm")}
              </button>
              <button
                onClick={() => {
                  setOverwrite(false);
                  update({ ui: { ...get().ui, overwriteRequest: "" } });
                }}
              >
                {t("cancel")}
              </button>
            </div>
          )}
          <details open={!!job}>
            <summary>{t("raw")}</summary>
            <pre>{ui.streams?.[key] ?? raw}</pre>
          </details>
          <button onClick={() => setMode("manual")}>{t("manual")}</button>
        </>
      )}
      <div
        aria-live="polite"
        className={error || ui.error ? "error" : "success"}
      >
        {error
          ? t("parseError") + ": " + error
          : ui.error || (success ? "✓ " + t("parsed") : "")}
      </div>
      </>}
    </section>
  );
}
