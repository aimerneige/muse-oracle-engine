import {
  parseJSONResponse,
  geminiEndpoint,
  stripDataPrefix,
} from "./shared.js";
export function imageProvider(settings) {
  const state = { settings };
  async function generateImage(prompt, signal) {
    if (state.settings.imageProvider === "gemini") {
      return generateGeminiImage(prompt, signal);
    }
    return generateOpenAIImage(prompt, signal);
  }

  async function generateGeminiImage(prompt, signal) {
    var endpoint = geminiEndpoint(
      state.settings.imageUseOfficialApi,
      state.settings.imageEndpoint,
      state.settings.imageModel,
    );
    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": state.settings.imageApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: "9:16",
            imageSize: state.settings.geminiImageSize,
          },
        },
      }),
      signal: signal,
    });
    var payload = await parseJSONResponse(response);
    var parts =
      (((payload.candidates || [])[0] || {}).content || {}).parts || [];
    for (var i = 0; i < parts.length; i++) {
      var inlineData = parts[i].inlineData || parts[i].inline_data;
      if (inlineData && inlineData.data) {
        return {
          dataUrl:
            "data:" +
            (inlineData.mimeType || inlineData.mime_type || "image/png") +
            ";base64," +
            inlineData.data,
        };
      }
    }
    throw new Error("Gemini returned no inline image data.");
  }

  async function generateOpenAIImage(prompt, signal) {
    var response = await fetch(state.settings.imageEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.settings.imageApiKey,
      },
      body: JSON.stringify({
        model: state.settings.imageModel,
        prompt: prompt,
        size: "1024x1536",
        quality: "high",
        output_format: "png",
        n: 1,
      }),
      signal: signal,
    });
    var payload = await parseJSONResponse(response);
    var image = (payload.data || [])[0];
    if (!image) {
      throw new Error("OpenAI returned no image data.");
    }
    if (image.b64_json) {
      return {
        dataUrl: "data:image/png;base64," + stripDataPrefix(image.b64_json),
      };
    }
    if (image.url) {
      return { dataUrl: image.url, url: image.url };
    }
    throw new Error("OpenAI returned no b64_json or url field.");
  }

  return { generateImage };
}
