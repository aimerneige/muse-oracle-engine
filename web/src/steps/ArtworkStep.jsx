import { useProject } from "../store/ProjectStore.jsx";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import { buildImages } from "../store/actions.js";
import { configured } from "../store/selectors.js";
import { imageDownloadFilename } from "../engine/exporters.js";
import ExportMenu from "../components/ExportMenu.jsx";
import { AutoTextarea } from "../components/StoryboardView.jsx";
function excerpt(content) {
  const text = content
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/^\s*(?:#{1,6}\s*|>\s*|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/[*_`~#]/g, "")
    .replace(/\s+/g, " ").trim();
  return text.length > 100 ? text.slice(0, 100) + "…" : text;
}
export default function ArtworkStep({
  data,
  onCopy,
  onGenerate,
  onLightbox,
  onError,
}) {
  const { project, settings, characterSettings, update, patchProject, job } =
    useProject();
  const { t } = useLocale();
  const configuredImage = configured(settings, "image");
  return (
    <section>
      <p>{t("imageHelp")}</p>
      <div className="toolbar">
        <button
          disabled={!!job}
          onClick={() =>
            update({ project: buildImages(data, project, characterSettings) })
          }
        >
          {t("buildImages")}
        </button>
        <ExportMenu onError={onError} />
      </div>
      <div className="image-grid">
        {project.panels.map((panel, i) => {
          const prompt = project.imagePrompts.find(
            (p) => p.index === panel.index,
          );
          const image = project.images.find((p) => p.index === panel.index);
          return (
            <article
              className="panel-card"
              key={panel.index}
              data-panel={panel.index}
            >
              <details className="episode-group" open>
                <summary>
                  {t("episode", {
                    n: project.longEpisodes[i]?.episode || panel.index,
                  })}{" "}
                  · {image?.dataUrl ? "1/1" : "0/1"}
                </summary>
                <details>
                  <summary className="panel-excerpt">
                    {excerpt(panel.content)}
                  </summary>
                  <label>
                    {t("edit")}
                    <AutoTextarea
                      rows={2}
                      disabled={!!job}
                      value={panel.content}
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
                </details>
                <div
                  className={
                    "image-area " +
                    (image?.status === "generating" ? "skeleton" : "")
                  }
                >
                  {image?.dataUrl ? (
                    <button
                      className="image-button"
                      onClick={() => onLightbox(image)}
                    >
                      <img
                        src={image.dataUrl}
                        alt={t("panel", { n: panel.index })}
                      />
                    </button>
                  ) : (
                    <p>
                      {t(
                        image?.status === "generating"
                          ? "generating"
                          : image?.status === "failed"
                            ? "failed"
                            : configuredImage
                              ? "pending"
                              : "imageManual",
                      )}
                    </p>
                  )}
                </div>
                {image?.error && (
                  <p className="error" role="alert">
                    {image.error}
                  </p>
                )}
                <details>
                  <summary>{t("prompt")}</summary>
                  <textarea readOnly rows={5} value={prompt?.prompt || ""} />
                </details>
                <div className="toolbar">
                  <button
                    disabled={!prompt}
                    onClick={() => onCopy(prompt.prompt)}
                  >
                    {t("copy")}
                  </button>
                  <button
                    disabled={!!job || !configuredImage}
                    onClick={() =>
                      onGenerate("artwork", undefined, panel.index)
                    }
                  >
                    {t(image?.status === "failed" ? "retry" : "regenerate")}
                  </button>
                  {image?.dataUrl && (
                    <a
                      href={image.dataUrl}
                      download={imageDownloadFilename(panel.index)}
                    >
                      {t("download")}
                    </a>
                  )}
                </div>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
