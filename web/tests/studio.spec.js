import { test, expect } from "@playwright/test";
const panels = () =>
  [1, 2, 3, 4].map((index) => ({
    index,
    content: "Friends share an umbrella " + index,
  }));
const scripts = () =>
  [1, 2].map((episode) => ({
    episode,
    panels: panels(),
    character_ids: [],
    costume_states: [],
  }));
const outline = () => ({
  title: "Umbrella",
  summary: "A rainy afternoon",
  episodes: [1, 2].map((episode) => ({
    episode,
    title: "Rain " + episode,
    summary: "Friends meet",
    character_ids: [],
  })),
});
async function setup(page, mode = "standard") {
  await page.goto("/");
  await page
    .getByRole("radio", {
      name: new RegExp(
        "^" + { standard: "标准漫画", long: "长漫画", four: "四格漫画" }[mode],
      ),
    })
    .click();
  await page.locator("#plotHint").fill("Friends share an umbrella.");
  await page.locator(".character-card").first().click();
  await page.locator(".action-bar .primary").click();
}
async function paste(page, value, number) {
  const input = page.getByLabel("粘贴结果", { exact: false });
  await (number === undefined ? input : input.nth(number)).fill(
    JSON.stringify(value),
  );
  await expect(
    page.locator(".generation-summary").first(),
  ).toBeVisible();
}
test("first visit validates setup, standard manual workflow and ZIP export", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".action-bar .primary")).toBeDisabled();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await page.getByRole("button", { name: "复制 Prompt", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Friends share an umbrella.",
  );
  await paste(page, { episodes: scripts() });
  await expect(page.locator(".storyboard-view .episode-group")).toHaveCount(2);
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".panel-card")).toHaveCount(2);
  await expect(page.locator(".action-bar .primary")).toHaveText("生成全部图片 Prompt");
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".action-bar .primary")).toContainText("导出作品");
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".export-options:popover-open")).toBeVisible();
  await expect(page.locator(".export-options:popover-open > button")).toHaveText(["图片 Prompt ZIP", "下载全部图片", "项目 JSON"]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".export-options:popover-open")).toHaveCount(0);
  await expect(page.locator(".export-menu")).toHaveCount(1);
  await page.locator(".action-bar .primary").click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "图片 Prompt ZIP", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  await expect(page.getByText("已自动保存 ✓")).toBeVisible();
  await page.reload();
  await expect(page.locator(".panel-card")).toHaveCount(2);
  expect(errors).toEqual([]);
});
test("long manual outline and grouped batch storyboards", async ({ page }) => {
  await setup(page, "long");
  await paste(page, outline());
  await page.locator(".action-bar .primary").click();
  await paste(page, { episodes: scripts() });
  await expect(page.locator(".storyboard-view .episode-group")).toHaveCount(2);
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".panel-card")).toHaveCount(2);
});
test("four candidates require selection and each storyboard auto parses", async ({
  page,
}) => {
  await setup(page, "four");
  await paste(page, outline());
  await expect(page.locator(".action-bar .primary")).toBeDisabled();
  await page.locator(".candidate-select").first().click();
  await page.locator(".action-bar .primary").click();
  await paste(page, scripts()[0]);
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".panel-card")).toHaveCount(1);
});
test("invalid JSON reports inline, corrected input unblocks navigation", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("粘贴结果", { exact: false }).fill("{broken");
  await expect(page.locator(".generation-block .error")).toContainText(
    "解析失败",
  );
  await expect(page.locator(".action-bar .primary")).toBeDisabled();
  await paste(page, { episodes: scripts() });
  await expect(page.locator(".action-bar .primary")).toBeEnabled();
});
test("legacy project restores artwork and settings dialog manages focus", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "lovelive-engine-web-project",
      JSON.stringify({
        id: "old",
        characterIds: ["lovelive/honoka"],
        plotHint: "old story",
        panels: [{ index: 1, content: "old storyboard", characterIds: [] }],
        imagePrompts: [{ index: 1, prompt: "old prompt" }],
        images: [{ index: 1, dataUrl: "should not persist" }],
      }),
    ),
  );
  await page.goto("/");
  await expect(page.locator(".panel-card")).toHaveCount(1);
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "模型设置", exact: true }),
  ).toBeFocused();
});
test("language switches live without losing draft; English controls and names", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#plotHint").fill("Keep this draft");
  await page.locator(".more-menu > summary").click();
  await page.getByLabel("界面语言").selectOption("en-US");
  await expect(page).toHaveTitle("Muse Oracle Engine");
  await expect(page.locator("#plotHint")).toHaveValue("Keep this draft");
  await expect(page.locator(".character-card").first()).toContainText(
    "Gotoh Hitori",
  );
  await page.locator(".more-menu > summary").click();
  await expect(page.locator("main")).not.toContainText(/[\u3400-\u9fff]/);
  await page
    .getByRole("button", { name: "Model settings", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toContainText(/[\u3400-\u9fff]/);
});

test("theme preference and named snapshot survive reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("项目名称", { exact: true }).fill("Rain project");
  await page.locator("#plotHint").fill("A quiet afternoon");
  await page.locator(".more-menu > summary").click();
  await page.getByLabel("主题", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: "存为快照", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await expect(page.locator("#plotHint")).toHaveValue("");
  await page.getByRole("button", { name: "项目历史", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Rain project", exact: true })
    .click();
  await expect(page.locator("#plotHint")).toHaveValue("A quiet afternoon");
  await expect(page.getByText("已自动保存 ✓")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("项目名称", { exact: true })).toHaveValue(
    "Rain project",
  );
});
