import { renderTemplate } from "./templates.js";
import {
  upsertCharacterSettings,
  buildCharacterSetting,
} from "./characters.js";
import { stripFourPanelStoryboardSubtitles } from "./parsers.js";

export function promptBuilder(data, project, characterSettings = []) {
  const all = upsertCharacterSettings(data.characters, characterSettings);
  const selected = project.characterIds
    .map((id) => all.find((c) => c.series + "/" + c.id === id))
    .filter(Boolean);
  const resolve = (ids) =>
    ids?.length
      ? ids
          .map((id) => all.find((c) => c.series + "/" + c.id === id))
          .filter(Boolean)
      : selected;
  const Language = project.language.trim() || "中文";
  const common = {
    Characters: selected,
    PlotHint: project.plotHint.trim(),
    Language,
  };
  return {
    standard: () => renderTemplate(data.storybookTemplate, common),
    outline: () =>
      renderTemplate(
        project.storyMode === "four"
          ? data.fourPanelOutlineTemplate
          : data.longOutlineTemplate,
        {
          ...common,
          StoryLength: project.storyLengthEnabled ? project.storyLength : 0,
          TotalPanels: project.storyLengthEnabled ? project.storyLength * 4 : 0,
        },
      ),
    batch: () =>
      renderTemplate(data.longBatchStoryboardTemplate, {
        Characters: selected,
        FullOutline: project.longOutline,
        Language,
      }),
    episode: (episode, four = project.storyMode === "four") => ({
      episode: episode.episode,
      prompt: renderTemplate(
        four ? data.fourPanelStoryboardTemplate : data.longEpisodeTemplate,
        {
          Characters: resolve(episode.character_ids),
          CharacterCostumes: (project.characterCostumes || []).filter((c) =>
            new Set(episode.character_ids || []).has(c.character_id),
          ),
          FullOutline: project.longOutline,
          Episode: episode,
          Language,
        },
      ),
    }),
    images: () =>
      project.panels.map((panel) => {
        const characters = resolve(panel.characterIds);
        const Characters = characters.length ? characters : selected;
        return {
          index: panel.index,
          prompt: renderTemplate(data.comicTemplates[project.style], {
            Characters,
            CharacterSetting: buildCharacterSetting(Characters),
            PanelContent:
              project.storyMode === "four"
                ? stripFourPanelStoryboardSubtitles(panel.content)
                : panel.content,
            Language,
          }),
        };
      }),
  };
}
