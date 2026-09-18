import { test, expect } from "@playwright/test";

async function setupStory(page, mode = "standard") {
  await page.goto("/");
  await page.locator("#plotHint").fill("放学后，两个人一起去寻找遗失的礼物。");
  await page.locator(".character-chip").first().click();
  await page.locator("#storyMode").selectOption(mode);
  await page.locator("#studioNextBtn").click();
}

test("guided standard workflow, draft recovery and export", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.locator("#studioNextBtn").click();
  await expect(page.locator("#studioFeedback")).toContainText("至少一位角色");
  await setupStory(page);
  await expect(page.locator("#storyPrompt")).toBeVisible();
  await expect(page.locator(".project-panel")).toBeHidden();
  await page.locator("#buildStoryboardPromptBtn").click();
  await expect(page.locator("#storyboardPrompt")).not.toHaveValue("");
  await page.locator("#rawStoryboard").fill(JSON.stringify({ episodes: [{ episode: 1, panels: Array.from({ length: 4 }, (_, i) => ({ index: i + 1, content: "两个人在教室寻找礼物。" })) }] }));
  await page.locator("#parseStoryboardBtn").click();
  await expect(page.locator(".layout")).toHaveAttribute("data-step", "images");
  await expect(page.locator("#imagePromptList")).not.toBeEmpty();
  const download = page.waitForEvent("download");
  await page.locator("#studioNextBtn").click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.reload();
  await expect(page.locator("#plotHint")).toHaveValue("放学后，两个人一起去寻找遗失的礼物。");
  await expect(page.locator("#selectedCharacters .character-chip")).toHaveCount(1);
  await page.locator('[data-studio-step="images"]').click();
  await expect(page.locator("#imagePromptList")).not.toBeEmpty();
  expect(errors).toEqual([]);
});

for (const mode of ["long", "four"]) {
  test(`${mode} outline workflow and stage guard`, async ({ page }) => {
    await setupStory(page, mode);
    await expect(page.locator("#longStepOutlinePanel")).toBeVisible();
    await page.locator('[data-studio-step="images"]').click();
    await expect(page.locator("#studioFeedback")).toContainText("解析");
    await page.locator("#buildLongOutlinePromptBtn").click();
    await expect(page.locator("#longOutlinePrompt")).not.toHaveValue("");
    await page.locator("#rawLongOutline").fill(JSON.stringify({ title: "礼物", episodes: [{ episode: 1, title: "寻找", summary: "两个人寻找礼物。", character_ids: [] }] }));
    await page.locator("#parseLongOutlineBtn").click();
    await expect(page.locator("#longOutlineSummary")).not.toBeEmpty();
    if (mode === "four") await page.locator("#longOutlineSummary input[type=checkbox]").first().check();
    await page.locator("#nextLongOutlineBtn").click();
    await expect(page.locator("#longStepEpisodesPanel")).toBeVisible();
    const script = { episode: 1, panels: Array.from({ length: 4 }, (_, i) => ({ index: i + 1, content: "在教室寻找礼物。" })), character_ids: [], costume_states: [] };
    if (mode === "long") {
      await page.locator("#rawLongBatchStoryboard").fill(JSON.stringify({ episodes: [script] }));
      await page.locator("#parseLongBatchStoryboardBtn").click();
    } else {
      await page.locator("#longEpisodeList textarea:not([readonly])").fill(JSON.stringify(script));
      await page.locator("#longEpisodeList button").filter({ hasText: "解析本话结果" }).click();
    }
    await page.locator("#studioNextBtn").click();
    await expect(page.locator("#longStepImagesPanel")).toBeVisible();
    await expect(page.locator("#longImagePromptList")).not.toBeEmpty();
  });
}

test("tools, keyboard dismissal, themes and mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('[data-studio-tool="settings"]').click();
  await expect(page.locator("#settingsBody")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#studioToolsDialog")).toBeHidden();
  await page.locator('[data-studio-tool="history"]').click();
  await expect(page.locator("#historyList")).toBeVisible();
  await expect(page.locator("#settingsPanel")).toBeHidden();
  await page.keyboard.press("Escape");
  await page.locator(".theme-control select").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".layout")).toHaveAttribute("data-step", "setup");
  await expect(page.locator(".project-panel")).toBeVisible();
  await page.locator("#plotHint").fill("切换主题后仍然可以创作");
  await page.locator(".character-chip").first().click();
  await page.locator("#studioNextBtn").click();
  await expect(page.locator(".layout")).toHaveAttribute("data-step", "story");
  await page.locator("#studioBackBtn").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/studio-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".theme-control select").selectOption("light");
  await page.screenshot({ path: "test-results/studio-desktop.png", fullPage: true });
});

test("missing API settings are actionable and English navigation works", async ({ page }) => {
  await setupStory(page);
  await page.locator("#callLLMBtn").click();
  await expect(page.locator("#apiConfigDialog")).toBeVisible();
  await page.locator("#apiConfigDialog button").click();
  await expect(page.locator("#studioToolsDialog")).toBeVisible();
  await expect(page.locator("#llmApiKey")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator(".locale-control select").selectOption("en-US");
  await expect(page.locator("#studioTitle")).toHaveText("What story will you tell today?");
  await page.locator("#studioNextBtn").click();
  await expect(page.locator("#studioTitle")).toHaveText("Bring your scenes to life.");
});
