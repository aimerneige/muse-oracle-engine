import { useId } from "react";
import { useProject } from "../store/ProjectStore.jsx";
import { useLocale } from "../i18n/LocaleProvider.jsx";
import { exportImagePromptsZip, downloadJSON, imageDownloadFilename } from "../engine/exporters.js";
import { persistableProject } from "../engine/storage.js";

export default function ExportMenu({ primary = true, onError }) {
  const { project } = useProject();
  const { t } = useLocale();
  const id = useId();
  return <div className="export-menu">
    <button className={primary ? "primary" : ""} popoverTarget={id}>{t("exportWork")} ▾</button>
    <div id={id} popover="auto" className="export-options">
      <button disabled={!project.imagePrompts.length} onClick={() => exportImagePromptsZip(project).catch(onError)}>{t("zip")}</button>
      <button disabled={!project.images.some(i => i.dataUrl)} onClick={() => project.images.filter(i => i.dataUrl).forEach(i => {
        const a = document.createElement("a");
        a.href = i.dataUrl;
        a.download = imageDownloadFilename(i.index);
        a.click();
      })}>{t("downloadAll")}</button>
      <button onClick={() => downloadJSON(persistableProject(project), "lovelive-engine-project-" + project.id + ".json")}>{t("json")}</button>
    </div>
  </div>;
}
