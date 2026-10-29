import { useLocale } from "../i18n/LocaleProvider.jsx";
import { newProject, persistableProject } from "../engine/storage.js";
import { downloadJSON } from "../engine/exporters.js";
export default function AppHeader({
  store,
  confirm,
  setDialog,
  error,
  restore,
  theme,
  setTheme,
  setToast,
}) {
  const { project, patchProject, job, update } = store;
  const { t, locale, setLocale } = useLocale();
  return (
    <header className="app-header">
      <strong className="brand">{t("brand")}</strong>
      <div className="project-meta">
        <input
          aria-label={t("projectName")}
          placeholder={t("untitled")}
          value={project.name || ""}
          disabled={!!job}
          onChange={(e) => patchProject({ name: e.target.value })}
        />
        <small role="status">
          {t(store.saveError ? "saveFailed" : store.saved ? "saved" : "saving")}
        </small>
      </div>
      <button
        aria-label={t("settings")}
        disabled={!!job}
        onClick={() => setDialog({ type: "settings" })}
      >
        ⚙ <span>{t("settings")}</span>
      </button>
      <details className="more-menu">
        <summary aria-label={t("more")}>⋯</summary>
        <div className="menu-content">
          <button
            disabled={!!job}
            onClick={() =>
              confirm(t("newConfirm"), () => {
                store.snapshot();
                update({ project: newProject(), ui: { step: "setup" } });
              })
            }
          >
            {t("newProject")}
          </button>
          {["history", "logs"].map((type) => (
            <button
              key={type}
              disabled={!!job}
              onClick={() => setDialog({ type })}
            >
              {t(type)}
            </button>
          ))}
          <button
            disabled={!!job}
            onClick={() => {
              try {
                store.snapshot();
                setToast(t("saved"));
              } catch (e) {
                error(e);
              }
            }}
          >
            {t("snapshot")}
          </button>
          <label className="file-label">
            {t("importProject")}
            <input
              type="file"
              accept=".json"
              disabled={!!job}
              onChange={async (e) => {
                const file = e.target.files[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const p = JSON.parse(await file.text());
                  if (
                    !p.id ||
                    !Array.isArray(p.characterIds) ||
                    !Array.isArray(p.panels)
                  )
                    throw new Error(t("invalidProject"));
                  confirm(t("overwrite"), () => restore(p));
                } catch (e) {
                  error(e);
                }
              }}
            />
          </label>
          <button
            onClick={() =>
              downloadJSON(
                persistableProject(project),
                "lovelive-engine-project-" + project.id + ".json",
              )
            }
          >
            {t("json")}
          </button>
          <label>
            {t("locale")}
            <select
              aria-label={t("locale")}
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label>
            {t("theme")}
            <select
              aria-label={t("theme")}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              {["system", "light", "dark"].map((mode) => (
                <option key={mode} value={mode}>
                  {t(mode)}
                </option>
              ))}
            </select>
          </label>
          <a
            href="https://github.com/aimerneige/muse-oracle-engine"
            target="_blank"
            rel="noreferrer"
          >
            {t("repository")}
          </a>
        </div>
      </details>
    </header>
  );
}
