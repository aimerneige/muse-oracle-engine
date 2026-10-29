import JSZip from "jszip";
function imageDownloadFilename(index) {
  var now = new Date();
  var months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return (
    [
      "LoveLive",
      "Fan",
      months[now.getMonth()],
      String(now.getDate()).padStart(2, "0"),
      String(now.getFullYear()),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
      String(index).padStart(3, "0"),
    ].join("_") + ".png"
  );
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJSON(value, filename) {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    filename,
  );
}
export async function exportImagePromptsZip(project) {
  const zip = new JSZip();
  project.imagePrompts.forEach((item) =>
    zip.file(
      "image-" + String(item.index).padStart(3, "0") + ".md",
      "# 图片 " + item.index + " Prompt\n\n" + (item.prompt || "") + "\n",
    ),
  );
  downloadBlob(
    await zip.generateAsync({ type: "blob" }),
    "lovelive-engine-image-prompts-" + project.id + ".zip",
  );
}
export { imageDownloadFilename };
