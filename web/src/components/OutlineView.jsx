import { useProject } from "../store/ProjectStore.jsx";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import { clearedStoryboard } from "../store/actions.js";
export default function OutlineView() {
  const { project, patchProject, job } = useProject();
  const { t } = useLocale();
  const outline = project.longOutline;
  if (!outline) return null;
  const four = project.storyMode === "four";
  const select = (selectedFourPanelStories) =>
    patchProject({ ...clearedStoryboard, selectedFourPanelStories });
  const edit = (episode, field, value) =>
    patchProject({
      ...clearedStoryboard,
      longOutline: {
        ...outline,
        episodes: outline.episodes.map((e) =>
          e.episode === episode ? { ...e, [field]: value } : e,
        ),
      },
    });
  return (
    <section className="outline-view">
      <label>
        {t("title")}
        <input
          value={outline.title || ""}
          disabled={!!job}
          onChange={(e) =>
            patchProject({
              ...clearedStoryboard,
              longOutline: { ...outline, title: e.target.value },
            })
          }
        />
      </label>
      <label>
        {t("summary")}
        <textarea
          rows={2}
          value={outline.summary || ""}
          disabled={!!job}
          onChange={(e) =>
            patchProject({
              ...clearedStoryboard,
              longOutline: { ...outline, summary: e.target.value },
            })
          }
        />
      </label>
      {four && (
        <button
          onClick={() => select(outline.episodes.map((e) => e.episode))}
          disabled={!!job}
        >
          {t("all")}
        </button>
      )}
      <div className="candidate-grid">
        {outline.episodes.map((e) => (
          <article key={e.episode} className="outline-card">
            {four && (
              <button
                className="candidate-select"
                disabled={!!job}
                aria-pressed={project.selectedFourPanelStories.includes(
                  e.episode,
                )}
                onClick={() =>
                  select(
                    project.selectedFourPanelStories.includes(e.episode)
                      ? project.selectedFourPanelStories.filter(
                          (n) => n !== e.episode,
                        )
                      : [...project.selectedFourPanelStories, e.episode],
                  )
                }
              >
                {project.selectedFourPanelStories.includes(e.episode)
                  ? "✓ "
                  : "+ "}
                {t("episode", { n: e.episode })} · {e.title}
                <p>{e.summary}</p>
              </button>
            )}
            <details open={!four}>
              <summary>
                {four ? t("edit") : t("episode", { n: e.episode })}
              </summary>
              <label>
                {t("title")}
                <input
                  value={e.title}
                  disabled={!!job}
                  onChange={(event) =>
                    edit(e.episode, "title", event.target.value)
                  }
                />
              </label>
              <label>
                {t("summary")}
                <textarea
                  rows={2}
                  value={e.summary}
                  disabled={!!job}
                  onChange={(event) =>
                    edit(e.episode, "summary", event.target.value)
                  }
                />
              </label>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
