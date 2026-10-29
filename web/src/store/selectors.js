export const stepsFor = (project) =>
  project.storyMode === "standard"
    ? ["setup", "storyboard", "artwork"]
    : ["setup", "outline", "storyboard", "artwork"];
export const selectedEpisodes = (project) =>
  (project.longOutline?.episodes || []).filter(
    (e) =>
      project.storyMode !== "four" ||
      project.selectedFourPanelStories.includes(e.episode),
  );
export const setupReady = (project) =>
  !!(
    project.characterIds.length &&
    project.plotHint.trim() &&
    (project.storyMode !== "long" ||
      !project.storyLengthEnabled ||
      (Number.isInteger(project.storyLength) && project.storyLength >= 2))
  );
export function storyboardReady(project) {
  return project.storyMode === "standard"
    ? !!project.panels.length
    : !!selectedEpisodes(project).length &&
        selectedEpisodes(project).every((e) =>
          project.longEpisodes.some((s) => s.episode === e.episode),
        );
}
export function canEnter(project, step) {
  if (step === "setup") return true;
  if (!setupReady(project)) return false;
  if (
    step === "outline" ||
    (step === "storyboard" && project.storyMode === "standard")
  )
    return true;
  if (step === "storyboard") return !!selectedEpisodes(project).length;
  return storyboardReady(project);
}
export function recoveredStep(project) {
  if (project.panels.length) return "artwork";
  if (selectedEpisodes(project).length) return "storyboard";
  return "setup";
}
export function configured(settings, kind) {
  return !!(
    settings[kind + "ApiKey"] &&
    settings[kind + "Model"] &&
    ((settings[kind + "Provider"] === "gemini" &&
      settings[kind + "UseOfficialApi"]) ||
      settings[kind + "Endpoint"])
  );
}
