import { test, expect } from "@playwright/test";
const script = {
  episodes: [
    {
      episode: 1,
      panels: [1, 2, 3, 4].map((index) => ({
        index,
        content: "Umbrella " + index,
      })),
    },
  ],
};
const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
async function configuredPage(page, provider) {
  await page.addInitScript((provider) => {
    localStorage.setItem(
      "lovelive-engine-web-settings",
      JSON.stringify({
        llmProvider: provider,
        llmApiKey: "mock-text-key",
        llmModel: "test-text",
        llmEndpoint: "https://mock.test/chat",
        llmUseOfficialApi: true,
        imageProvider: provider,
        imageApiKey: "mock-image-key",
        imageModel: "test-image",
        imageEndpoint: "https://mock.test/images",
        imageUseOfficialApi: true,
        geminiImageSize: "1K",
      }),
    );
  }, provider);
  await page.goto("/");
  await page.locator("#plotHint").fill("Rain");
  await page.locator(".character-card").first().click();
  await page.locator(".action-bar .primary").click();
}
for (const variant of ["gemini", "gemini-sse", "openai"]) {
  const provider = variant === "gemini-sse" ? "gemini" : variant;
  test(`${variant} AI parses automatically and generates images`, async ({
    page,
  }) => {
    let calls = 0;
    await page.route(
      provider === "gemini" ? "**/v1beta/models/**" : "https://mock.test/**",
      async (route) => {
        const request = route.request().postDataJSON();
        const image =
          provider === "gemini" ? !!request.generationConfig : !!request.prompt;
        calls++;
        if (image)
          return route.fulfill({
            json:
              provider === "gemini"
                ? {
                    candidates: [
                      {
                        content: {
                          parts: [
                            {
                              inlineData: {
                                mimeType: "image/png",
                                data: pixel,
                              },
                            },
                          ],
                        },
                      },
                    ],
                  }
                : { data: [{ b64_json: pixel }] },
          });
        if (variant === "gemini-sse")
          return route.fulfill({
            contentType: "text/event-stream",
            body:
              "data: " +
              JSON.stringify({
                candidates: [
                  { content: { parts: [{ text: JSON.stringify(script) }] } },
                ],
              }) +
              "\n\n",
          });
        if (provider === "gemini")
          return route.fulfill({
            json: {
              candidates: [
                { content: { parts: [{ text: JSON.stringify(script) }] } },
              ],
            },
          });
        const text = JSON.stringify(script);
        return route.fulfill({
          contentType: "text/event-stream",
          body:
            [text.slice(0, 40), text.slice(40)]
              .map(
                (content) =>
                  "data: " +
                  JSON.stringify({ choices: [{ delta: { content } }] }) +
                  "\n\n",
              )
              .join("") + "data: [DONE]\n\n",
        });
      },
    );
    await configuredPage(page, provider);
    await page.locator(".action-bar .primary").click();
    await expect(page.locator(".storyboard-view .episode-group")).toHaveCount(
      1,
    );
    await expect(page.locator(".generation-summary")).toContainText("✓ 已解析 · 4 格");
    await expect(page.locator(".generation-block textarea")).toHaveCount(0);
    await page.locator(".action-bar .primary").click();
    await page.locator(".action-bar .primary").click();
    await expect(page.locator(".action-bar .primary")).toHaveText("生成全部图片（0/1）");
    await page.locator(".action-bar .primary").click();
    await expect(page.locator(".image-area img")).toHaveCount(1);
    await expect(page.locator(".action-bar .primary")).toContainText("导出作品");
    expect(calls).toBe(2);
    await page.locator(".image-button").click();
    await expect(page.locator(".lightbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".lightbox")).toHaveCount(0);
  });
}
test("stopping an OpenAI request prevents fallback and permits retry", async ({
  page,
}) => {
  let requests = 0;
  let unblock;
  const blocked = new Promise((resolve) => {
    unblock = resolve;
  });
  await page.route("https://mock.test/chat", async (route) => {
    requests++;
    if (requests === 1) {
      await blocked;
      await route.abort().catch(() => {});
      return;
    }
    await route.fulfill({
      contentType: "text/event-stream",
      body:
        "data: " +
        JSON.stringify({
          choices: [{ delta: { content: JSON.stringify(script) } }],
        }) +
        "\n\ndata: [DONE]\n\n",
    });
  });
  await configuredPage(page, "openai");
  await page.locator(".action-bar .primary").click();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stepper button").first()).toBeDisabled();
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toHaveCount(0);
  unblock();
  expect(requests).toBe(1);
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".storyboard-view .episode-group")).toHaveCount(1);
  expect(requests).toBe(2);
});
test("image failure is inline and retry skips completed images", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/v1beta/models/**", (route) => {
    const body = route.request().postDataJSON();
    if (!body.generationConfig)
      return route.fulfill({
        json: {
          candidates: [
            { content: { parts: [{ text: JSON.stringify(script) }] } },
          ],
        },
      });
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 500,
        json: { error: "temporary failure" },
      });
    return route.fulfill({
      json: {
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: pixel } }],
            },
          },
        ],
      },
    });
  });
  await configuredPage(page, "gemini");
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".storyboard-view .episode-group")).toHaveCount(1);
  await page.locator(".action-bar .primary").click();
  await page.locator(".action-bar .primary").click();
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".panel-card .error")).toContainText("HTTP 500");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".image-area img")).toHaveCount(1);
  await page.locator(".action-bar .primary").click();
  await expect(
    page.getByRole("button", { name: "停止", exact: true }),
  ).toHaveCount(0);
  expect(attempts).toBe(2);
});
test("automatic pipeline generates story and images in sequence", async ({
  page,
}) => {
  await page.route("**/v1beta/models/**", (route) =>
    route.fulfill({
      json: route.request().postDataJSON().generationConfig
        ? {
            candidates: [
              {
                content: {
                  parts: [
                    { inlineData: { mimeType: "image/png", data: pixel } },
                  ],
                },
              },
            ],
          }
        : {
            candidates: [
              { content: { parts: [{ text: JSON.stringify(script) }] } },
            ],
          },
    }),
  );
  await configuredPage(page, "gemini");
  await page.getByLabel("从这里自动完成全部").check();
  await page.locator(".action-bar .primary").click();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-step",
    "artwork",
  );
  await expect(page.locator(".image-area img")).toHaveCount(1);
});
