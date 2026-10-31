import { useProject } from "../store/ProjectStore.jsx";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import {
  parseJSONBlock,
  normalizeStandardStoryboard,
  longMangaEpisodeContent,
} from "../engine/parsers.js";
export function AutoTextarea(props) {
  return (
    <textarea
      {...props}
      ref={(node) => {
        if (node) {
          node.style.height = "auto";
          node.style.height = node.scrollHeight + "px";
        }
      }}
      onInput={(e) => {
        e.currentTarget.style.height = "auto";
        e.currentTarget.style.height = e.currentTarget.scrollHeight + "px";
        props.onInput?.(e);
      }}
    />
  );
}
export default function StoryboardView() {
  const { project, patchProject, job } = useProject();
  const { t } = useLocale();
  let scripts = project.longEpisodes;
  if (project.storyMode === "standard") {
    try {
      scripts = normalizeStandardStoryboard(
        parseJSONBlock(project.rawStoryboard),
      );
    } catch {
      scripts = [];
    }
  }
  const editScene = (episodeNumber, panelIndex, content) => {
    const next = scripts.map((s) =>
      s.episode === episodeNumber
        ? {
            ...s,
            panels: s.panels.map((p, i) =>
              i === panelIndex ? { ...p, content } : p,
            ),
          }
        : s,
    );
    patchProject({
      ...(project.storyMode === "standard"
        ? { rawStoryboard: JSON.stringify({ episodes: next }, null, 2) }
        : { longEpisodes: next }),
      panels: next.map((s, i) => ({
        index: i + 1,
        content: longMangaEpisodeContent(s, project.storyMode === "four"),
        characterIds: s.character_ids || [],
      })),
      imagePrompts: [],
      images: [],
    });
  };
  return (
    <section className="storyboard-view">
      {project.panels.map((panel, i) => (
        <details
          className="episode-group"
          key={panel.index}
          open={project.panels.length < 4}
        >
          <summary>
            {t("episode", {
              n: scripts[i]?.episode || panel.index,
            })}{" "}
            ·{" "}
            {scripts[i]?.title ||
              panel.content
                .replace(/[#*]/g, "")
                .replace(/\s+/g, " ")
                .slice(0, 90)}
          </summary>
          {scripts[i] ? (
            scripts[i].panels.map((scene, sceneIndex) => (
              <details className="scene-row" key={sceneIndex}>
                <summary>
                  {sceneIndex + 1} ·{" "}
                  {scene.content
                    .replace(/[#*]/g, "")
                    .replace(/\s+/g, " ")
                    .slice(0, 120)}
                </summary>
                <label>
                  {t("edit")}
                  <AutoTextarea
                    rows={2}
                    value={scene.content}
                    disabled={!!job}
                    onChange={(e) =>
                      editScene(scripts[i].episode, sceneIndex, e.target.value)
                    }
                  />
                </label>
              </details>
            ))
          ) : (
            <label>
              {t("edit")}
              <AutoTextarea
                rows={2}
                value={panel.content}
                disabled={!!job}
                onChange={(e) =>
                  patchProject({
                    panels: project.panels.map((p) =>
                      p.index === panel.index
                        ? { ...p, content: e.target.value }
                        : p,
                    ),
                    imagePrompts: [],
                    images: [],
                  })
                }
              />
            </label>
          )}
        </details>
      ))}
    </section>
  );
}
