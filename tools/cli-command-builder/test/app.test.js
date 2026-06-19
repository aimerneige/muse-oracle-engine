const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCommand, quoteShell, validateConfig } = require("../app.js");

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
    ...overrides
  };
}

test("quotes shell values containing spaces and apostrophes", () => {
  assert.equal(quoteShell("it's tea time"), "'it'\\''s tea time'");
  assert.equal(quoteShell("watercolor"), "watercolor");
});

test("builds a complete create command", () => {
  const result = buildCommand(config({ promptOnly: true, longManga: true }));

  assert.equal(
    result.command,
    "go run cmd/generate/main.go --characters lovelive/honoka,lovelive/umi --plot '放学后的点心时间' --style watercolor --language '中文' --prompt-only --long-manga"
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
