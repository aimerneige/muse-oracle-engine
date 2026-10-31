export function defaultSettings() {
  return {
    llmProvider: "gemini",
    llmUseOfficialApi: true,
    llmEndpoint: "",
    llmApiKey: "",
    llmModel: "gemini-3.1-pro-preview",
    imageProvider: "gemini",
    imageUseOfficialApi: true,
    imageEndpoint: "",
    imageApiKey: "",
    imageModel: "gemini-3.1-flash-image",
    geminiImageSize: "1K",
  };
}

export function defaultProject() {
  return {
    id: makeID(),
    status: "draft",
    characterIds: [],
    plotHint: "",
    storyLengthEnabled: true,
    storyLength: 4,
    style: "watercolor",
    storyMode: "long",
    language: "中文",
    storyboardPrompt: "",
    rawStoryboard: "",
    panels: [],
    imagePrompts: [],
    images: [],
    longOutlinePrompt: "",
    rawLongOutline: "",
    longOutline: null,
    selectedFourPanelStories: [],
    longBatchStoryboardEnabled: true,
    longBatchStoryboardPrompt: "",
    rawLongBatchStoryboard: "",
    longEpisodePrompts: [],
    longEpisodeRaws: [],
    longEpisodes: [],
    characterCostumes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function hydrateProject(project) {
  var hydrated = merge(defaultProject(), project);
  if (project && !Object.prototype.hasOwnProperty.call(project, "storyMode")) {
    hydrated.storyMode = "standard";
  }
  if (
    project &&
    !Object.prototype.hasOwnProperty.call(project, "storyLengthEnabled")
  ) {
    hydrated.storyLengthEnabled = project.storyLength > 0;
  }
  hydrated.longBatchStoryboardEnabled = hydrated.storyMode === "long";
  hydrated.images = [];
  return hydrated;
}

export function persistableProject(project) {
  var snapshot = merge({}, project);
  snapshot.images = [];
  return snapshot;
}

export function readJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

export function merge(base, patch) {
  return Object.assign({}, base, patch || {});
}

export function makeID() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return "project-" + Date.now();
}

export const keys = {
  settings: "lovelive-engine-web-settings",
  project: "lovelive-engine-web-project",
  history: "lovelive-engine-web-history",
  characters: "lovelive-engine-web-characters",
};
export function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function newProject() {
  return {
    ...defaultProject(),
    storyMode: "standard",
    longBatchStoryboardEnabled: false,
  };
}
