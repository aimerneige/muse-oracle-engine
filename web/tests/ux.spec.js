import { test, expect } from "@playwright/test";
import fs from "node:fs";
test("four stages in desktop/mobile and light/dark, no horizontal overflow", async ({
  page,
}) => {
  fs.mkdirSync("test-results/ux", { recursive: true });
  await page.goto("/");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  await page.getByRole("radio", { checked: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(page.locator(".mode-card").nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".mode-card[aria-checked=true]")).toContainText("✓");
  await expect(page.locator(".mode-card[aria-checked=false]").first()).not.toContainText("✓");
  const unselected = page.locator(".mode-card[aria-checked=false]").first();
  await unselected.hover();
  expect(await unselected.evaluate(e => getComputedStyle(e).color)).toBe(await page.locator("body").evaluate(e => getComputedStyle(e).color));
  await expect(page.locator(".page-heading")).toHaveCount(0);
  await page.locator(".mode-card").nth(1).click();
  await page.locator("#plotHint").fill("放学后，两位朋友在雨中分享一把伞。");
  await page.locator(".character-card").first().click();
  const capture = async (step) => {
    for (const [device, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (theme) => (document.documentElement.dataset.theme = theme),
          theme,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(page.locator(".action-bar")).toBeInViewport();
        await expect(page.locator(".workspace h1, .workspace .eyebrow")).toHaveCount(0);
        if (device === "mobile") {
          expect((await page.locator(".action-bar").boundingBox()).height).toBeLessThanOrEqual(80);
          await expect(page.locator(".action-hint")).toBeHidden();
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `test-results/ux/${step}-${device}-${theme}.png`,
        });
        if (["storyboard", "artwork"].includes(step) && device === "desktop" && theme === "light")
          await page.screenshot({ path: `test-results/ux/${step}-full.png`, fullPage: true });
      }
    }
  };
  await capture("setup");
  await page.locator(".action-bar .primary").click();
  await page.getByLabel("粘贴结果", { exact: false }).fill(
    JSON.stringify({
      title: "共享的伞",
      summary: "雨天的小故事",
      episodes: [1, 2].map((episode) => ({
        episode,
        title: "雨中相遇",
        summary: "朋友们在雨中互相照顾。",
        character_ids: [],
      })),
    }),
  );
  await expect(page.locator(".generation-summary")).toContainText("✓ 已解析 · 8 格");
  await expect(page.getByLabel("粘贴结果", { exact: false })).toHaveCount(0);
  await page.setViewportSize({ width: 760, height: 844 });
  expect((await page.locator(".action-bar").boundingBox()).height).toBeLessThanOrEqual(80);
  await capture("outline");
  await page.locator(".action-bar .primary").click();
  await page.getByLabel("粘贴结果", { exact: false }).fill(
    JSON.stringify({
      episodes: [1, 2].map((episode) => ({
        episode,
        panels: [1, 2, 3, 4].map((index) => ({
          index,
          content: "放学后，朋友们在雨中共享一把伞，笑着走向车站。",
        })),
        character_ids: [],
        costume_states: [],
      })),
    }),
  );
  await expect(page.locator(".generation-summary")).toContainText("✓ 已解析 · 8 格");
  await expect(page.getByLabel("粘贴结果", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "查看原文 / 重新粘贴" }).click();
  await expect(page.getByLabel("粘贴结果", { exact: false })).toBeVisible();
  await capture("storyboard");
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".action-bar .primary")).toHaveText("生成全部图片 Prompt");
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".action-bar .primary")).toContainText("导出作品");
  await expect(page.locator(".panel-excerpt").first()).not.toContainText(/#|\*\*/);
  await expect(page.locator(".panel-excerpt").first()).toContainText("…");
  await page.locator(".panel-excerpt").first().click();
  await expect(page.locator(".panel-card textarea").first()).toHaveValue(/####[\s\S]*\*\*/);
  await page.locator(".panel-excerpt").first().click();
  await expect(page.locator(".panel-card h3")).toHaveCount(0);
  expect(await page.locator(".panel-card > .episode-group").first().evaluate(e => getComputedStyle(e).borderTopWidth)).toBe("0px");
  await capture("artwork");
  await expect(page.getByText("已自动保存 ✓")).toHaveText("已自动保存 ✓");
  await page.reload();
  await page.locator(".stepper button").nth(2).click();
  await expect(page.locator(".generation-summary")).toBeVisible();
  await expect(page.getByLabel("粘贴结果", { exact: false })).toHaveCount(0);
});
