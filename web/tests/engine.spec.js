import { test, expect } from "@playwright/test";
import fs from "node:fs";
import vm from "node:vm";
import { promptBuilder } from "../src/engine/prompts.js";
import * as parsers from "../src/engine/parsers.js";
const baseline = JSON.parse(
  fs.readFileSync("tests/fixtures/legacy-baseline.json"),
);
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync("src/generated/data.js", "utf8"), sandbox);
const data = sandbox.window.LLE_DATA;

test("legacy prompt and parser baseline remains byte-for-byte identical", () => {
  const { project, outline, scripts } = structuredClone(baseline.input);
  project.longOutline = parsers.normalizeLongOutline(outline);
  const builder = promptBuilder(data, project);
  expect(builder.standard()).toBe(baseline.output.standard);
  expect(builder.outline()).toBe(baseline.output.long);
  expect(promptBuilder(data, { ...project, storyMode: "four" }).outline()).toBe(
    baseline.output.four,
  );
  expect(builder.batch()).toBe(baseline.output.batch);
  expect(builder.episode(outline.episodes[0], false)).toEqual(
    baseline.output.episode,
  );
  expect(builder.episode(outline.episodes[0], true)).toEqual(
    baseline.output.fourEpisode,
  );
  expect(
    parsers.normalizeStandardStoryboard(
      parsers.parseJSONBlock(
        "```json\n" + JSON.stringify({ episodes: scripts }) + "\n```",
      ),
    ),
  ).toEqual(baseline.output.parsedStandard);
  expect(
    parsers.normalizeLongBatchStoryboard(
      { episodes: structuredClone(scripts) },
      project,
    ),
  ).toEqual(baseline.output.parsedBatch);
  expect(
    parsers.stripFourPanelStoryboardSubtitles(
      "# 标题\n【起】\n人物对话\n第 2 格\n继续对话",
    ),
  ).toBe(baseline.output.stripped);
  project.panels = [
    {
      index: 1,
      content: parsers.longMangaEpisodeContent(scripts[0], false),
      characterIds: [],
    },
  ];
  for (const style of data.styles)
    expect(
      promptBuilder(data, { ...project, style: style.id }).images()[0].prompt,
    ).toBe(baseline.output.images[style.id]);
});

test("parser rejects incomplete, duplicate and invalid costume data", () => {
  const { project, outline, scripts } = structuredClone(baseline.input);
  project.longOutline = outline;
  expect(() =>
    parsers.normalizeStandardStoryboard({ episodes: [{ panels: [] }] }),
  ).toThrow("exactly 4");
  expect(() =>
    parsers.normalizeLongBatchStoryboard(
      { episodes: [scripts[0], scripts[0]] },
      project,
    ),
  ).toThrow("duplicate");
  expect(() =>
    parsers.normalizeLongBatchStoryboard({ episodes: [scripts[0]] }, project),
  ).toThrow("missing episode");
  scripts[0].costume_states = [];
  expect(() =>
    parsers.normalizeLongBatchStoryboard({ episodes: scripts }, project),
  ).toThrow("missing costume");
});
