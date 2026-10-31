const officialGeminiBaseURL = "https://generativelanguage.googleapis.com";
export async function parseJSONResponse(response) {
  var text = await response.text();
  var payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw new Error("HTTP " + response.status + ": " + text);
    }
  }
  if (!response.ok) {
    throw new Error("HTTP " + response.status + ": " + JSON.stringify(payload));
  }
  return payload;
}

export async function readSSEText(response, extractDelta, onDelta, signal) {
  if (!response.ok) {
    await parseJSONResponse(response);
  }
  if (!response.body || !response.body.getReader) {
    throw new Error("Streaming response is not readable in this browser.");
  }

  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  var buffer = "";
  var fullText = "";

  while (true) {
    if (signal && signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    var result = await reader.read();
    if (result.done) {
      break;
    }
    buffer += decoder.decode(result.value, { stream: true });
    var lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.indexOf("data:") !== 0) {
        continue;
      }
      var dataLine = line.slice(5).trim();
      if (dataLine === "[DONE]") {
        return fullText;
      }
      var payload = JSON.parse(dataLine);
      var delta = extractDelta(payload);
      if (!delta) {
        continue;
      }
      fullText += delta;
      if (onDelta) {
        onDelta(delta);
      }
    }
  }

  if (!fullText) {
    throw new Error("Streaming response returned no text.");
  }
  return fullText;
}

export function geminiEndpoint(useOfficialApi, baseURL, model) {
  var base = useOfficialApi ? officialGeminiBaseURL : baseURL;
  return (
    trimTrailingSlashes(base) +
    "/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent"
  );
}

export function trimTrailingSlashes(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/g, "");
}

export function streamEndpoint(endpoint) {
  var streamed = endpoint.replace(":generateContent", ":streamGenerateContent");
  return streamed.indexOf("?") === -1
    ? streamed + "?alt=sse"
    : streamed + "&alt=sse";
}

export function stripDataPrefix(value) {
  var index = value.indexOf("base64,");
  return index === -1 ? value : value.slice(index + 7);
}
