import AppHeader from "./components/AppHeader.jsx";
import Stepper from "./components/Stepper.jsx";
import ActionBar from "./components/ActionBar.jsx";
import { useEffect, useState } from "react";
import { ProjectProvider, useProject } from "./store/ProjectStore.jsx";
import { LocaleProvider, useLocale } from "./i18n/LocaleProvider.jsx";
import {
  stepsFor,
  canEnter,
  setupReady,
  storyboardReady,
  configured,
  recoveredStep,
} from "./store/selectors.js";
import { runPipeline } from "./store/pipeline.js";
import { buildImages } from "./store/actions.js";
import {
  keys,
  readJSON,
  writeJSON,
  hydrateProject,
} from "./engine/storage.js";
import {
  normalizeCharacterSetting,
  upsertCharacterSettings,
} from "./engine/characters.js";
import { downloadJSON } from "./engine/exporters.js";
import SetupStep from "./steps/SetupStep.jsx";
import OutlineStep from "./steps/OutlineStep.jsx";
import StoryboardStep from "./steps/StoryboardStep.jsx";
import ArtworkStep from "./steps/ArtworkStep.jsx";
import SettingsDialog from "./components/SettingsDialog.jsx";
import CharacterEditorDialog from "./components/CharacterEditorDialog.jsx";
import Dialog from "./components/Dialog.jsx";

function Workspace() {
  const data = window.LLE_DATA;
  const store = useProject();
  const { project, settings, ui, job, update, patchProject, get } = store;
  const { t } = useLocale();
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("lovelive-engine-web-theme") || "system",
  );
  const [auto, setAuto] = useState(false);
  const steps = stepsFor(project);
  const step = ui.step;
  const index = steps.indexOf(step);
  useEffect(() => {
    if (theme === "system")
      document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem("lovelive-engine-web-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const error = (e) => {
    setToast(e.message);
    update({
      ui: { ...get().ui, error: e.message },
      logs: [...get().logs, "Error: " + e.message],
    });
  };
  const confirm = (message, action) => setConfirmation({ message, action });
  const navigate = (next) => {
    if (!get().job && canEnter(get().project, next))
      update({ ui: { ...get().ui, step: next, error: "" } });
  };
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(t("copied"));
    } catch {
      setToast(t("clipboardError"));
    }
  };
  const generate = async (from, episode, onlyImage, approved = false) => {
    if (get().job) return;
    const hasResult =
      from === "outline"
        ? !!get().project.longOutline
        : from === "storyboard" &&
          (episode
            ? get().project.longEpisodes.some((e) => e.episode === episode)
            : !!get().project.panels.length);
    if (hasResult && !auto && !approved) {
      update({
        ui: { ...get().ui, overwriteRequest: from + ":" + (episode || "") },
      });
      return;
    }
    const controller = new AbortController();
    update({
      job: { controller, stage: from, completed: 0, total: 1 },
      ui: { ...get().ui, error: "", overwriteRequest: "" },
    });
    try {
      await runPipeline({
        from,
        to: auto ? "artwork" : from,
        get,
        update,
        data,
        signal: controller.signal,
        onlyImage,
        force: !auto || !!episode,
        episode,
        onProgress: (progress) =>
          update({
            job: { controller, ...progress },
            logs: [
              ...get().logs,
              `${progress.stage}: ${progress.completed}/${progress.total}`,
            ],
          }),
        onRaw: (stage, n, raw) =>
          update({
            ui: {
              ...get().ui,
              streams: { ...get().ui.streams, [stage + ":" + (n || "")]: raw },
            },
          }),
      });
      setToast(t("done"));
      update({ ui: { ...get().ui, error: "", parseErrors: {} } });
      if (auto && get().project.panels.length)
        update({ ui: { ...get().ui, step: "artwork" } });
    } catch (e) {
      if (controller.signal.aborted) setToast(t("stopped"));
      else error(e);
    } finally {
      update({ job: null });
    }
  };
  const next = () => {
    if (step === "artwork") {
      if (!project.imagePrompts.length)
        update({ project: buildImages(data, project, store.characterSettings) });
      else if (configured(settings, "image")) generate("artwork");
      return;
    }
    const target = steps[index + 1];
    navigate(target);
  };
  const stageErrors = Object.entries(ui.parseErrors || {}).some(
    ([key, value]) => value && key.startsWith(step + ":"),
  );
  const nextReady =
    !job &&
    !stageErrors &&
    (step === "setup"
      ? setupReady(project)
      : step === "outline"
        ? !!project.longOutline &&
          (project.storyMode !== "four" ||
            !!project.selectedFourPanelStories.length)
        : step === "storyboard"
          ? storyboardReady(project)
          : true);
  const targetEpisode =
    step === "storyboard" && project.storyMode === "four"
      ? project.selectedFourPanelStories.find(
          (n) => !project.longEpisodes.some((e) => e.episode === n),
        )
      : undefined;
  const canGenerate =
    !job &&
    !nextReady &&
    ["outline", "storyboard"].includes(step) &&
    configured(settings, "llm") &&
    ui.generationModes?.[step + ":" + (targetEpisode || "")] === "ai";
  const hint = job
    ? t("running")
    : step === "setup"
      ? !project.characterIds.length
        ? t("missingCharacters")
        : !project.plotHint.trim()
          ? t("missingIdea")
          : !setupReady(project)
            ? t("invalidLength")
            : t("localNote")
      : step === "outline" && project.storyMode === "four"
        ? `${project.selectedFourPanelStories.length} · ${t("selected")} ${!nextReady ? t("selectCandidate") : ""}`
        : !nextReady
          ? t("finishParse")
          : t("localNote");
  const common = {
    data,
    onSettings: () => setDialog({ type: "settings" }),
    onCopy: copy,
    onGenerate: generate,
  };
  const importCharacters = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.characters;
      if (
        !Array.isArray(list) ||
        list.some((c) => !normalizeCharacterSetting(c))
      )
        throw new Error(t("invalidCharacter"));
      const next = upsertCharacterSettings(
        store.characterSettings,
        list.map(normalizeCharacterSetting),
      );
      writeJSON(keys.characters, next);
      update({ characterSettings: next });
      setToast(t("saved"));
    } catch (e) {
      error(e);
    }
  };
  const restore = (p) => {
    store.snapshot();
    const project = hydrateProject(p);
    update({ project, ui: { step: recoveredStep(project) } });
    setDialog(null);
  };
  return (
    <>
      <AppHeader
        {...{
          store,
          confirm,
          setDialog,
          error,
          restore,
          theme,
          setTheme,
          setToast,
        }}
      />
      <Stepper {...{ steps, project, job, step, ui, navigate }} />
      <main className="workspace" data-step={step}>
        {ui.error && (
          <p className="error" role="alert">
            {ui.error}
          </p>
        )}
        {store.saveError && (
          <p className="error" role="alert">
            {t("saveFailed")}: {store.saveError}
          </p>
        )}
        {step === "setup" && (
          <SetupStep
            data={data}
            onEdit={(character) => setDialog({ type: "character", character })}
            onImport={importCharacters}
            onExport={() =>
              downloadJSON(
                { version: 1, characters: store.characterSettings },
                "lovelive-engine-character-settings.json",
              )
            }
            onConfirm={confirm}
          />
        )}
        {step === "outline" && <OutlineStep {...common} />}{" "}
        {step === "storyboard" && <StoryboardStep {...common} />}{" "}
        {step === "artwork" && (
          <ArtworkStep
            {...common}
            onLightbox={(image) => setDialog({ type: "lightbox", image })}
          />
        )}
      </main>
      <ActionBar
        {...{
          job,
          index,
          steps,
          navigate,
          hint,
          step,
          auto,
          setAuto,
          nextReady,
          next,
          settings,
          canGenerate,
          generate,
          targetEpisode,
          onError: error,
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {confirmation && (
        <Dialog title={t("confirm")} onClose={() => setConfirmation(null)}>
          <p>{confirmation.message}</p>
          <div className="dialog-actions">
            <button onClick={() => setConfirmation(null)}>{t("cancel")}</button>
            <button
              className="primary"
              onClick={() => {
                try {
                  confirmation.action();
                  setConfirmation(null);
                } catch (e) {
                  error(e);
                }
              }}
            >
              {t("confirm")}
            </button>
          </div>
        </Dialog>
      )}
      {dialog?.type === "settings" && (
        <SettingsDialog
          data={data}
          onClose={() => setDialog(null)}
          onError={error}
        />
      )}{" "}
      {dialog?.type === "character" && (
        <CharacterEditorDialog
          character={dialog.character}
          data={data}
          onClose={() => setDialog(null)}
        />
      )}{" "}
      {dialog?.type === "lightbox" && (
        <Dialog
          title={t("panel", { n: dialog.image.index })}
          onClose={() => setDialog(null)}
        >
          <img
            className="lightbox"
            src={dialog.image.dataUrl}
            alt={t("panel", { n: dialog.image.index })}
          />
        </Dialog>
      )}
      {["history", "logs"].includes(dialog?.type) && (
        <Dialog title={t(dialog.type)} onClose={() => setDialog(null)}>
          {dialog.type === "history" ? (
            <>
              <button
                onClick={() =>
                  confirm(t("clearConfirm"), () => {
                    writeJSON(keys.history, []);
                    setDialog(null);
                  })
                }
              >
                {t("clear")}
              </button>
              <div className="history-list">
                {readJSON(keys.history, []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      try {
                        restore(p);
                      } catch (e) {
                        error(e);
                      }
                    }}
                  >
                    {p.name || p.plotHint || t("untitled")}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => update({ logs: [] })}>{t("clear")}</button>
              <pre>{store.logs.join("\n") || t("empty")}</pre>
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
export default function App() {
  return (
    <LocaleProvider>
      <ProjectProvider>
        <Workspace />
      </ProjectProvider>
    </LocaleProvider>
  );
}
