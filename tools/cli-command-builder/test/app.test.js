const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const {
  buildCommand,
  filterCharacters,
  mergeCharacterIDs,
  quoteShell,
  validateConfig
} = require("../app.js");

require("../character-data.js");

function config(overrides = {}) {
  return {
    mode: "create",
    executable: "go run cmd/generate/main.go",
    characters: "lovelive/honoka,lovelive/umi",
    plot: "放学后的点心时间",
    style: "watercolor",
    language: "中文",
    resume: "",
    retryImage: "",
    listType: "list-characters",
    promptOnly: false,
    longManga: false,
	storyLength: "4",
	fourPanelManga: false,
    ...overrides
  };
}

test("quotes shell values containing spaces and apostrophes", () => {
  assert.equal(quoteShell("it's tea time"), "'it'\\''s tea time'");
  assert.equal(quoteShell('"$HOME"; `whoami`'), "'\"$HOME\"; `whoami`'");
  assert.equal(quoteShell("watercolor"), "watercolor");
});

test("escapes control characters as a single-line ANSI-C shell value", () => {
  assert.equal(
    quoteShell("第一行\r\n第二行\tit's \\ ready"),
    "$'第一行\\r\\n第二行\\tit\\'s \\\\ ready'"
  );
});

test("generated command never contains raw line breaks from plot text", () => {
  const result = buildCommand(config({ plot: "第一行\n第二行\r\n第三行" }));

  assert.equal(result.command.includes("\n"), false);
  assert.equal(result.command.includes("\r"), false);
  assert.match(result.command, /--plot \$'第一行\\n第二行\\r\\n第三行'/);
});

test("special characters survive a real Zsh parsing round trip", () => {
  const original = "第一行\r\n第二行\t'\"$HOME`whoami`\\end";
  const result = spawnSync("zsh", ["-c", "printf %s " + quoteShell(original)], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, original);
});

test("builds a complete create command", () => {
  const result = buildCommand(config({ promptOnly: true, longManga: true, storyLength: "12" }));

  assert.equal(
    result.command,
    "go run cmd/generate/main.go --characters lovelive/honoka,lovelive/umi --plot '放学后的点心时间' --style watercolor --language '中文' --prompt-only --long-manga --story-length 12"
  );
  assert.deepEqual(result.errors, []);
});

test("builds resume and retry command without create parameters", () => {
  const result = buildCommand(config({
    mode: "resume",
    resume: "project-id",
    retryImage: "3",
    promptOnly: true
  }));

  assert.equal(
    result.command,
    "go run cmd/generate/main.go --resume project-id --retry-image 3 --prompt-only"
  );
  assert.deepEqual(result.errors, []);
});

test("builds a four-panel manga command", () => {
	const result = buildCommand(config({ fourPanelManga: true }));

	assert.match(result.command, /--four-panel-manga$/);
	assert.deepEqual(result.errors, []);
});

test("rejects conflicting multi-round manga modes", () => {
	const result = buildCommand(config({ longManga: true, fourPanelManga: true }));

	assert.deepEqual(result.errors, ["长篇漫画与四格漫画流程不能同时启用"]);
});

test("rejects an invalid long manga story length", () => {
	const result = buildCommand(config({ longManga: true, storyLength: "0" }));

	assert.deepEqual(result.errors, ["剧情长度必须是大于 0 的整数"]);
});

test("builds exactly one list flag", () => {
  const result = buildCommand(config({ mode: "list", listType: "list-models" }));

  assert.equal(result.command, "go run cmd/generate/main.go --list-models");
  assert.deepEqual(result.parameters, ["--list-models"]);
});

test("reports missing create inputs and invalid retry index", () => {
  assert.equal(validateConfig(config({ characters: "", plot: "", style: "", language: "" })).length, 4);
  assert.deepEqual(
    validateConfig(config({ mode: "resume", resume: "project-id", retryImage: "0" })),
    ["重试图片序号必须是大于 0 的整数"]
  );
});

test("character catalog contains unique IDs from known series", () => {
  const data = globalThis.LLE_CHARACTER_DATA;
  const seriesIDs = new Set(data.series.map((series) => series.id));
  const characterIDs = data.characters.map((character) => character.series + "/" + character.id);

  assert.equal(data.series.length, 8);
  assert.equal(data.characters.length, 125);
  assert.equal(new Set(characterIDs).size, characterIDs.length);
  assert.equal(data.characters.every((character) => seriesIDs.has(character.series)), true);
});

test("character filtering requires a series or query", () => {
  const data = globalThis.LLE_CHARACTER_DATA;

  assert.deepEqual(filterCharacters(data, "", ""), []);
  assert.equal(filterCharacters(data, "lovelive", "").every((character) => character.series === "lovelive"), true);
  assert.deepEqual(
    filterCharacters(data, "", "honoka").map((character) => character.series + "/" + character.id),
    ["lovelive/honoka"]
  );
});

test("selected and custom character IDs are merged without duplicates", () => {
  assert.deepEqual(
    mergeCharacterIDs(["lovelive/honoka"], "lovelive/umi, lovelive/honoka"),
    ["lovelive/honoka", "lovelive/umi"]
  );
});
