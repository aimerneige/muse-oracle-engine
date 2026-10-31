import * as parser from "../engine/parsers.js";
import { promptBuilder } from "../engine/prompts.js";

export const clearedStoryboard = {
  longBatchStoryboardPrompt: "",
  rawLongBatchStoryboard: "",
  longEpisodePrompts: [],
  longEpisodeRaws: [],
  longEpisodes: [],
  characterCostumes: [],
  panels: [],
  imagePrompts: [],
  images: [],
};
export function parseResult(project, stage, raw, episodeNumber) {
  const payload = parser.parseJSONBlock(raw);
  if (stage === "outline")
    return {
      ...project,
      ...clearedStoryboard,
      rawLongOutline: raw,
      longOutline: parser.normalizeLongOutline(payload),
      selectedFourPanelStories: [],
      status:
        project.storyMode === "four"
          ? "four_panel_outline_done"
          : "long_outline_done",
    };
  let scripts;
  let patch;
  if (project.storyMode === "standard") {
    scripts = parser.normalizeStandardStoryboard(payload);
    patch = { rawStoryboard: raw };
  } else if (project.storyMode === "long") {
    scripts = parser.normalizeLongBatchStoryboard(payload, project);
    patch = { rawLongBatchStoryboard: raw, longEpisodes: scripts };
  } else {
    const outline = project.longOutline.episodes.find(
      (e) => e.episode === episodeNumber,
    );
    if (!outline) throw new Error("Episode is not in the outline.");
    const script = parser.normalizeLongEpisode(payload, outline);
    if (
      script.panels.length !== 4 ||
      script.panels.some(
        (p, i) =>
          p.index !== i + 1 || parser.hasFourPanelStoryboardSubtitle(p.content),
      )
    )
      throw new Error(
        "Four-panel storyboard must contain exactly four title-free panels indexed 1, 2, 3, 4.",
      );
    scripts = [
      ...project.longEpisodes.filter((e) => e.episode !== episodeNumber),
      script,
    ].sort((a, b) => a.episode - b.episode);
    patch = {
      longEpisodes: scripts,
      longEpisodeRaws: [
        ...project.longEpisodeRaws.filter((e) => e.episode !== episodeNumber),
        { episode: episodeNumber, raw },
      ],
    };
  }
  const costumes = {};
  scripts.forEach((s) =>
    (s.costume_states || []).forEach((c) => {
      if (c.character_id && c.outfit) costumes[c.character_id] = c;
    }),
  );
  return {
    ...project,
    ...patch,
    characterCostumes: Object.keys(costumes)
      .sort()
      .map((id) => costumes[id]),
    panels: scripts.map((s, i) => ({
      index: i + 1,
      content: parser.longMangaEpisodeContent(s, project.storyMode === "four"),
      characterIds: s.character_ids || [],
    })),
    imagePrompts: [],
    images: [],
    status: "storyboard_done",
  };
}
export function buildImages(data, project, characters) {
  const imagePrompts = promptBuilder(data, project, characters).images();
  return {
    ...project,
    imagePrompts,
    images: imagePrompts.map(
      (p) =>
        project.images.find((i) => i.index === p.index) || {
          index: p.index,
          status: "pending",
          dataUrl: "",
          error: "",
        },
    ),
    status: "image_prompt_ready",
  };
}
export function generationPrompt(data, project, characters, stage, episode) {
  const builder = promptBuilder(data, project, characters);
  if (stage === "outline") return builder.outline();
  if (project.storyMode === "standard") return builder.standard();
  if (project.storyMode === "long") return builder.batch();
  return builder.episode(
    project.longOutline.episodes.find((e) => e.episode === episode),
  ).prompt;
}
export function promptPatch(project, stage, episode, prompt) {
  if (stage === "outline") return { longOutlinePrompt: prompt };
  if (project.storyMode === "standard") return { storyboardPrompt: prompt };
  if (project.storyMode === "long")
    return { longBatchStoryboardPrompt: prompt };
  return {
    longEpisodePrompts: [
      ...project.longEpisodePrompts.filter((e) => e.episode !== episode),
      { episode, prompt },
    ].sort((a, b) => a.episode - b.episode),
  };
}
export function rawResultPatch(project, stage, episode, raw) {
  if (stage === "outline") return { rawLongOutline: raw };
  if (project.storyMode === "standard") return { rawStoryboard: raw };
  if (project.storyMode === "long") return { rawLongBatchStoryboard: raw };
  return {
    longEpisodeRaws: [
      ...project.longEpisodeRaws.filter((e) => e.episode !== episode),
      { episode, raw },
    ],
  };
}
