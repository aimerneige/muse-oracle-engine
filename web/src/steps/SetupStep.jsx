import { useLocale } from "../i18n/LocaleProvider.jsx";
import { useProject } from "../store/ProjectStore.jsx";
import { clearedStoryboard } from "../store/actions.js";
import CharacterPicker from "../components/CharacterPicker.jsx";

export default function SetupStep({
  data,
  onEdit,
  onImport,
  onExport,
  onConfirm,
}) {
  const { project, patchProject } = useProject();
  const { t, name, description } = useLocale();
  const mode = (storyMode) => {
    if (storyMode === project.storyMode) return;
    const change = () =>
      patchProject({
        ...clearedStoryboard,
        storyMode,
        longBatchStoryboardEnabled: storyMode === "long",
        longOutline: null,
        rawLongOutline: "",
        longOutlinePrompt: "",
        rawStoryboard: "",
        storyboardPrompt: "",
        selectedFourPanelStories: [],
      });
    if (project.panels.length || project.longOutline)
      onConfirm(t("resetMode"), change);
    else change();
  };
  return (
    <div className="setup-step">
      <div className="mode-grid" role="radiogroup" aria-label={t("setup")}>
        {["standard", "long", "four"].map((m) => (
          <button
            key={m}
            className="mode-card"
            role="radio"
            aria-checked={project.storyMode === m}
            tabIndex={project.storyMode === m ? 0 : -1}
            onKeyDown={(e) => {
              const modes = ["standard", "long", "four"];
              if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const i = e.key === "Home" ? 0 : e.key === "End" ? 2 : (modes.indexOf(m) + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : 2)) % 3;
              mode(modes[i]);
              e.currentTarget.parentElement.children[i].focus();
            }}
            onClick={() => mode(m)}
          >
            <strong>{t(m)} {project.storyMode === m && <span aria-hidden="true">✓</span>}</strong>
            <small>{t(m + "Desc")}</small>
          </button>
        ))}
      </div>
      <section>
        <label className="idea-label">
          {t("idea")}
          <textarea
            id="plotHint"
            rows={4}
            placeholder={t("ideaHint")}
            value={project.plotHint}
            onChange={(e) => patchProject({ plotHint: e.target.value })}
          />
        </label>
        <button
          onClick={() => {
            const change = () => patchProject({ plotHint: t("ideaExample") });
            if (project.plotHint.trim()) onConfirm(t("overwrite"), change);
            else change();
          }}
        >
          {t("inspiration")}
        </button>
      </section>
      <CharacterPicker data={data} onEdit={onEdit} />
      <details>
        <summary>{t("manageCharacters")}</summary>
        <div className="toolbar">
          <button onClick={() => onEdit(null)}>{t("add")}</button>
          <label className="file-label">
            {t("importCharacters")}
            <input type="file" accept=".json" onChange={onImport} />
          </label>
          <button onClick={onExport}>{t("exportCharacters")}</button>
        </div>
        <p>{t("backup")}</p>
      </details>
      <section>
        <h2>{t("style")}</h2>
        <div className="style-grid">
          {data.styles.map((style) => (
            <button
              key={style.id}
              aria-pressed={project.style === style.id}
              onClick={() =>
                patchProject({ style: style.id, imagePrompts: [], images: [] })
              }
            >
              <strong>{name(style)}</strong>
              <small>{description(style)}</small>
            </button>
          ))}
        </div>
      </section>
      <details>
        <summary>{t("advanced")}</summary>
        <label>
          {t("language")}
          <input
            value={project.language}
            onChange={(e) => patchProject({ language: e.target.value })}
          />
        </label>
        {project.storyMode === "long" && (
          <>
            <label className="check">
              <input
                type="radio"
                name="lengthMode"
                checked={!project.storyLengthEnabled}
                onChange={() => patchProject({ storyLengthEnabled: false })}
              />
              {t("autoLength")}
            </label>
            <label className="check">
              <input
                type="radio"
                name="lengthMode"
                checked={project.storyLengthEnabled}
                onChange={() =>
                  patchProject({
                    storyLengthEnabled: true,
                    storyLength: project.storyLength || 4,
                  })
                }
              />
              {t("fixedLength")}
            </label>
            {project.storyLengthEnabled && (
              <label>
                {t("episodes")}
                <input
                  type="number"
                  min={2}
                  step={1}
                  value={project.storyLength}
                  onChange={(e) =>
                    patchProject({ storyLength: Number(e.target.value) })
                  }
                />
                <span>
                  {project.storyLength * 4} {t("totalPanels")}
                </span>
              </label>
            )}
          </>
        )}
      </details>
    </div>
  );
}
