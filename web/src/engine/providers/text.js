import {
  parseJSONResponse,
  readSSEText,
  geminiEndpoint,
  streamEndpoint,
} from "./shared.js";
export function textProvider(settings) {
  const state = { settings };
  const log = () => {};
  const readableError = (error) => error.message;
  const appendTypewriter = async (text, onDelta) => {
    if (onDelta) onDelta(text);
  };
  async function generateText(prompt, onDelta, onReset, signal) {
    if (state.settings.llmProvider === "gemini") {
      return generateGeminiText(prompt, onDelta, onReset, signal);
    }
    return generateOpenAIText(prompt, onDelta, onReset, signal);
  }

  async function generateGeminiText(prompt, onDelta, onReset, signal) {
    var endpoint = geminiGenerateContentEndpoint();
    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": state.settings.llmApiKey,
      },
      body: JSON.stringify(buildGeminiTextRequest(prompt)),
      signal: signal,
    });
    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      return readSSEText(
        response,
        (payload) =>
          ((payload.candidates || [])[0]?.content?.parts || [])
            .map((part) => part.text || "")
            .join(""),
        onDelta,
        signal,
      );
    }
    var payload = await parseJSONResponse(response);
    var text = extractGeminiText(payload);
    await appendTypewriter(text, onDelta);
    return text;
  }

  function buildGeminiTextRequest(prompt) {
    return {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    };
  }

  function extractGeminiText(payload) {
    var candidates = payload.candidates || [];
    var text = candidates
      .map(function (candidate) {
        var parts = (candidate.content || {}).parts || [];
        return parts
          .map(function (part) {
            return part.text || "";
          })
          .join("");
      })
      .join("");
    if (text) {
      return text;
    }
    throw new Error(geminiNoTextMessage(payload));
  }

  function geminiNoTextMessage(payload) {
    var candidate = (payload.candidates || [])[0] || {};
    var details = [];
    if (candidate.finishReason) {
      details.push("finishReason=" + candidate.finishReason);
    }
    if (candidate.safetyRatings && candidate.safetyRatings.length) {
      details.push(
        "safetyRatings=" +
          candidate.safetyRatings
            .map(function (rating) {
              return rating.category + ":" + rating.probability;
            })
            .join(","),
      );
    }
    return details.length
      ? "Gemini returned no text content (" + details.join("; ") + ")."
      : "Gemini returned no text content.";
  }

  function geminiGenerateContentEndpoint() {
    return geminiEndpoint(
      state.settings.llmUseOfficialApi,
      state.settings.llmEndpoint,
      state.settings.llmModel,
    );
  }

  async function generateGeminiTextStream(endpoint, prompt, onDelta, signal) {
    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": state.settings.llmApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: signal,
    });
    return readSSEText(
      response,
      function (payload) {
        var parts =
          (((payload.candidates || [])[0] || {}).content || {}).parts || [];
        return parts
          .map(function (part) {
            return part.text || "";
          })
          .join("");
      },
      onDelta,
      signal,
    );
  }

  async function generateOpenAIText(prompt, onDelta, onReset, signal) {
    try {
      return await generateOpenAITextStream(prompt, onDelta, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      log(
        "OpenAI streaming failed, falling back to normal request: " +
          readableError(err),
      );
      if (onReset) {
        onReset();
      }
    }
    var response = await fetch(state.settings.llmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.settings.llmApiKey,
      },
      body: JSON.stringify({
        model: state.settings.llmModel,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: signal,
    });
    var payload = await parseJSONResponse(response);
    var choice = (payload.choices || [])[0];
    var text = choice && choice.message ? choice.message.content : "";
    if (!text) {
      throw new Error("OpenAI returned no chat completion content.");
    }
    await appendTypewriter(text, onDelta);
    return text;
  }

  async function generateOpenAITextStream(prompt, onDelta, signal) {
    var response = await fetch(state.settings.llmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + state.settings.llmApiKey,
      },
      body: JSON.stringify({
        model: state.settings.llmModel,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }),
      signal: signal,
    });
    return readSSEText(
      response,
      function (payload) {
        var choice = (payload.choices || [])[0] || {};
        return choice.delta ? choice.delta.content || "" : "";
      },
      onDelta,
      signal,
    );
  }

  return { generateText };
}
