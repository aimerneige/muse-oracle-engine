import { useLocale } from "../i18n/LocaleProvider.jsx";
import { configured } from "../store/selectors.js";
import { useProject } from "../store/ProjectStore.jsx";
import ExportMenu from "./ExportMenu.jsx";
export default function ActionBar({
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
  onError,
}) {
  const { t } = useLocale();
  const { project } = useProject();
  const completed = project.panels.filter(p => project.images.some(i => i.index === p.index && i.dataUrl)).length;
  const needsImages = configured(settings, "image") && completed < project.panels.length;
  return (
    <footer className="action-bar">
      <button
        className="back-button"
        aria-label={t("back")}
        disabled={!!job || index === 0}
        onClick={() => navigate(steps[index - 1])}
      >
        <span aria-hidden="true">←</span><span className="back-label">{t("back")}</span>
      </button>
      <div className="action-hint" aria-live="polite">
        {job ? (
          <>
            <span>
              {t(job.stage)} · {job.completed}/{job.total}
            </span>
            <progress value={job.completed} max={job.total} />
          </>
        ) : (
          hint
        )}
      </div>
      {job ? (
        <button onClick={() => job.controller.abort()}>{t("stop")}</button>
      ) : (
        <div className="primary-actions">
          {step === "artwork" && project.imagePrompts.length > 0 && needsImages && <ExportMenu primary={false} onError={onError} />}
          {step !== "setup" && step !== "artwork" && (
            <label className="check">
              <input
                type="checkbox"
                aria-label={t("auto")}
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              <span className="auto-label">{t("auto")}</span><span className="auto-short" aria-hidden="true">⚡</span>
            </label>
          )}
          {step === "artwork" && project.imagePrompts.length > 0 && !needsImages ? <ExportMenu onError={onError} /> : <button
            className="primary"
            disabled={!nextReady && !canGenerate}
            onClick={() =>
              canGenerate ? generate(step, targetEpisode) : next()
            }
          >
            {t(
              canGenerate
                ? "generate"
                : step === "setup"
                  ? "start"
                  : step === "artwork"
                    ? !project.imagePrompts.length ? "buildImages" : "generateImages"
                    : "next",
            )}
            {step === "artwork" && project.imagePrompts.length > 0 && `（${completed}/${project.panels.length}）`}
          </button>}
        </div>
      )}
    </footer>
  );
}
