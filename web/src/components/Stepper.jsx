import { useLocale } from "../i18n/LocaleProvider.jsx";
import { setupReady, storyboardReady, canEnter } from "../store/selectors.js";
export default function Stepper({ steps, project, job, step, ui, navigate }) {
  const { t } = useLocale();
  return (
    <nav className="stepper" aria-label={t("setup")}>
      {steps.map((s, i) => {
        const complete =
          s === "setup"
            ? setupReady(project)
            : s === "outline"
              ? !!project.longOutline
              : s === "storyboard"
                ? storyboardReady(project)
                : project.images.length > 0 &&
                  project.images.every((i) => i.dataUrl);
        return (
          <button
            key={s}
            disabled={!!job || !canEnter(project, s)}
            aria-current={s === step ? "step" : undefined}
            onClick={() => navigate(s)}
          >
            <span className="step-number">{complete ? "✓" : i + 1}</span>
            <span>
              {t(
                s === "outline" && project.storyMode === "four"
                  ? "candidates"
                  : s,
              )}
              <small>
                {t(
                  ui.error && s === step
                    ? "failed"
                    : complete
                      ? "completed"
                      : s === step
                        ? "inProgress"
                        : "pending",
                )}
              </small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
