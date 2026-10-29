import { textProvider } from "../engine/providers/text.js";
import { imageProvider } from "../engine/providers/image.js";
import {
  generationPrompt,
  parseResult,
  buildImages,
  promptPatch,
  rawResultPatch,
} from "./actions.js";
import { selectedEpisodes, configured, storyboardReady } from "./selectors.js";

// 顺序执行以保留话数、服装状态与服务限流语义；失败即停，重跑跳过已完成环节。
export async function runPipeline({
  from,
  to = "artwork",
  get,
  update,
  data,
  signal,
  onProgress,
  onRaw,
  onlyImage,
  force = false,
  episode,
}) {
  const check = () => signal.throwIfAborted();
  const generate = async (stage, episode) => {
    check();
    const { project, settings, characterSettings } = get();
    if (!configured(settings, "llm"))
      throw new Error("Text API is not configured.");
    const prompt = generationPrompt(
      data,
      project,
      characterSettings,
      stage,
      episode,
    );
    update({
      project: { ...project, ...promptPatch(project, stage, episode, prompt) },
    });
    onProgress({ stage, completed: 0, total: 1 });
    let raw = "";
    const text = await textProvider(settings).generateText(
      prompt,
      (delta) => {
        raw += delta;
        onRaw?.(stage, episode, raw);
      },
      () => {
        raw = "";
        onRaw?.(stage, episode, "");
      },
      signal,
    );
    check();
    update({
      project: {
        ...get().project,
        ...rawResultPatch(get().project, stage, episode, text),
      },
    });
    update({ project: parseResult(get().project, stage, text, episode) });
  };
  if (from === "outline") {
    if (force || !get().project.longOutline) await generate("outline");
    if (to === "outline") return;
    if (
      get().project.storyMode === "four" &&
      !get().project.selectedFourPanelStories.length
    )
      return;
  }
  if (from !== "artwork") {
    if (get().project.storyMode === "four") {
      for (const e of selectedEpisodes(get().project))
        if (
          (!episode || episode === e.episode) &&
          (force ||
            !get().project.longEpisodes.some((s) => s.episode === e.episode))
        )
          await generate("storyboard", e.episode);
    } else if (
      (force && from === "storyboard") ||
      !storyboardReady(get().project)
    )
      await generate("storyboard");
    if (to === "storyboard") return;
  }
  check();
  const snapshot = get();
  if (!snapshot.project.imagePrompts.length)
    update({
      project: buildImages(data, snapshot.project, snapshot.characterSettings),
    });
  if (!configured(get().settings, "image"))
    throw new Error("Image API is not configured.");
  const prompts = get().project.imagePrompts.filter((p) =>
    onlyImage
      ? p.index === onlyImage
      : !get().project.images.some((i) => i.index === p.index && i.dataUrl),
  );
  let completed = 0;
  const setImage = (index, patch) =>
    update({
      project: {
        ...get().project,
        images: [
          ...get().project.images.filter((i) => i.index !== index),
          { index, ...patch },
        ],
      },
    });
  for (const item of prompts) {
    check();
    onProgress({ stage: "artwork", completed, total: prompts.length });
    setImage(item.index, { status: "generating", dataUrl: "", error: "" });
    try {
      const image = await imageProvider(get().settings).generateImage(
        item.prompt,
        signal,
      );
      check();
      setImage(item.index, { ...image, status: "downloaded", error: "" });
    } catch (error) {
      setImage(item.index, {
        status: signal.aborted ? "pending" : "failed",
        dataUrl: "",
        error: signal.aborted ? "" : error.message,
      });
      throw error;
    }
    completed++;
    onProgress({ stage: "artwork", completed, total: prompts.length });
  }
  update({ project: { ...get().project, status: "completed" } });
}
