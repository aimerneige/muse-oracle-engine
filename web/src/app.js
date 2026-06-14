(function () {
  "use strict";

  var data = window.LLE_DATA;
  var settingsKey = "lovelive-engine-web-settings";
  var projectKey = "lovelive-engine-web-project";
  var historyKey = "lovelive-engine-web-history";
  var state = {
    settings: defaultSettings(),
    project: defaultProject(),
    logs: []
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", function () {
    bindElements();
    loadState();
    bindEvents();
    hydrateControls();
    renderAll();
    log("Ready. Static app loaded with " + data.characters.length + " characters and " + data.styles.length + " styles.");
  });

  function bindElements() {
    [
      "fullAutoBtn", "saveProjectBtn", "newProjectBtn", "saveSettingsBtn", "clearHistoryBtn",
      "llmProvider", "llmEndpoint", "llmApiKey", "llmModel",
      "imageProvider", "imageEndpoint", "imageApiKey", "imageModel", "geminiImageSize", "geminiImageSizeWrap",
      "historyList", "projectStatus", "seriesFilter", "characterSearch", "styleSelect", "languageInput",
      "characterList", "selectedCharacters", "plotHint", "buildStoryboardPromptBtn", "callLLMBtn", "parseManualBtn",
      "storyboardPrompt", "rawStoryboard", "parseStoryboardBtn", "buildImagePromptsBtn",
      "panelList", "imagePromptList", "callImageBtn", "imageList", "downloadProjectBtn",
      "clearLogBtn", "logOutput"
    ].forEach(function (id) {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.saveSettingsBtn.addEventListener("click", saveSettingsFromForm);
    els.fullAutoBtn.addEventListener("click", runFullAuto);
    els.saveProjectBtn.addEventListener("click", saveProject);
    els.newProjectBtn.addEventListener("click", newProject);
    els.clearHistoryBtn.addEventListener("click", clearHistory);
    els.llmProvider.addEventListener("change", onLLMProviderChange);
    els.imageProvider.addEventListener("change", onImageProviderChange);
    els.seriesFilter.addEventListener("change", renderCharacters);
    els.characterSearch.addEventListener("input", renderCharacters);
    els.styleSelect.addEventListener("change", syncProjectFromForm);
    els.languageInput.addEventListener("input", syncProjectFromForm);
    els.plotHint.addEventListener("input", syncProjectFromForm);
    els.buildStoryboardPromptBtn.addEventListener("click", buildStoryboardPrompt);
    els.callLLMBtn.addEventListener("click", callLLM);
    els.parseManualBtn.addEventListener("click", parseStoryboardFromRaw);
    els.parseStoryboardBtn.addEventListener("click", parseStoryboardFromRaw);
    els.buildImagePromptsBtn.addEventListener("click", buildImagePrompts);
    els.callImageBtn.addEventListener("click", callImageAPI);
    els.downloadProjectBtn.addEventListener("click", downloadProject);
    els.clearLogBtn.addEventListener("click", function () {
      state.logs = [];
      renderLogs();
    });

    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setActiveTab(tab.dataset.tab);
      });
    });

    document.querySelectorAll("[data-copy]").forEach(function (button) {
      button.addEventListener("click", function () {
        copyText(els[button.dataset.copy].value || "");
      });
    });

    window.addEventListener("beforeunload", function () {
      syncProjectFromForm();
      localStorage.setItem(projectKey, JSON.stringify(persistableProject(state.project)));
    });
  }

  function defaultSettings() {
    return {
      llmProvider: "gemini",
      llmEndpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      llmApiKey: "",
      llmModel: "gemini-3.1-pro-preview",
      imageProvider: "gemini",
      imageEndpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      imageApiKey: "",
      imageModel: "gemini-3.1-flash-image",
      geminiImageSize: "1K"
    };
  }

  function defaultProject() {
    return {
      id: makeID(),
      status: "draft",
      characterIds: [],
      plotHint: "",
      style: "chibi_figure",
      language: "中文",
      storyboardPrompt: "",
      rawStoryboard: "",
      panels: [],
      imagePrompts: [],
      images: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function loadState() {
    state.settings = merge(defaultSettings(), readJSON(settingsKey, {}));
    state.project = hydrateProject(readJSON(projectKey, {}));
  }

  function hydrateControls() {
    fillSelect(els.llmProvider, [
      { value: "gemini", label: "Gemini" },
      { value: "openai", label: "GPT" }
    ]);
    fillSelect(els.imageProvider, [
      { value: "gemini", label: "Gemini Nano Banana" },
      { value: "openai", label: "GPT Image" }
    ]);
    fillSelect(els.geminiImageSize, data.imageSizes.map(function (size) {
      return { value: size, label: size };
    }));

    fillSelect(els.seriesFilter, [{ value: "", label: "全部作品" }].concat(data.series.map(function (series) {
      return { value: series.id, label: series.name + " (" + series.id + ")" };
    })));
    fillSelect(els.styleSelect, data.styles.map(function (style) {
      return { value: style.id, label: style.name + " (" + style.id + ")" };
    }));

    applySettingsToForm();
    applyProjectToForm();
  }

  function applySettingsToForm() {
    els.llmProvider.value = state.settings.llmProvider;
    fillModelSelect(els.llmModel, state.settings.llmProvider, "llm");
    els.llmEndpoint.value = state.settings.llmEndpoint;
    els.llmApiKey.value = state.settings.llmApiKey;
    els.llmModel.value = state.settings.llmModel;

    els.imageProvider.value = state.settings.imageProvider;
    fillModelSelect(els.imageModel, state.settings.imageProvider, "image");
    els.imageEndpoint.value = state.settings.imageEndpoint;
    els.imageApiKey.value = state.settings.imageApiKey;
    els.imageModel.value = state.settings.imageModel;
    els.geminiImageSize.value = state.settings.geminiImageSize;
    els.geminiImageSizeWrap.style.display = state.settings.imageProvider === "gemini" ? "grid" : "none";
  }

  function applyProjectToForm() {
    els.styleSelect.value = state.project.style;
    els.languageInput.value = state.project.language;
    els.plotHint.value = state.project.plotHint;
    els.storyboardPrompt.value = state.project.storyboardPrompt;
    els.rawStoryboard.value = state.project.rawStoryboard;
  }

  function fillModelSelect(select, provider, kind) {
    var models = kind === "llm" ? data.llmModels[provider] : data.imageModels[provider];
    fillSelect(select, models.map(function (model) {
      return { value: model, label: modelLabel(provider, kind, model) };
    }));
  }

  function modelLabel(provider, kind, model) {
    if (provider === "gemini" && kind === "image" && model === "gemini-3.1-flash-image") {
      return "nano-banana-2 (" + model + ")";
    }
    return model;
  }

  function fillSelect(select, options) {
    select.innerHTML = "";
    options.forEach(function (option) {
      var el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    });
  }

  function onLLMProviderChange() {
    var provider = els.llmProvider.value;
    fillModelSelect(els.llmModel, provider, "llm");
    els.llmEndpoint.value = data.defaultEndpoints[provider].llm;
    els.llmModel.value = data.llmModels[provider][0];
  }

  function onImageProviderChange() {
    var provider = els.imageProvider.value;
    fillModelSelect(els.imageModel, provider, "image");
    els.imageEndpoint.value = data.defaultEndpoints[provider].image;
    els.imageModel.value = data.imageModels[provider][0];
    els.geminiImageSizeWrap.style.display = provider === "gemini" ? "grid" : "none";
  }

  function saveSettingsFromForm() {
    state.settings = {
      llmProvider: els.llmProvider.value,
      llmEndpoint: els.llmEndpoint.value.trim(),
      llmApiKey: els.llmApiKey.value.trim(),
      llmModel: els.llmModel.value,
      imageProvider: els.imageProvider.value,
      imageEndpoint: els.imageEndpoint.value.trim(),
      imageApiKey: els.imageApiKey.value.trim(),
      imageModel: els.imageModel.value,
      geminiImageSize: els.geminiImageSize.value
    };
    localStorage.setItem(settingsKey, JSON.stringify(state.settings));
    log("Settings saved locally.");
  }

  function syncProjectFromForm() {
    state.project.style = els.styleSelect.value;
    state.project.language = normalizeLanguage(els.languageInput.value);
    state.project.plotHint = els.plotHint.value.trim();
    state.project.storyboardPrompt = els.storyboardPrompt.value;
    state.project.rawStoryboard = els.rawStoryboard.value;
    state.project.updatedAt = new Date().toISOString();
    renderProjectStatus();
  }

  function saveProject() {
    syncProjectFromForm();
    var snapshot = persistableProject(state.project);
    localStorage.setItem(projectKey, JSON.stringify(snapshot));
    var history = readHistory();
    var next = history.filter(function (item) {
      return item.id !== snapshot.id;
    });
    next.unshift(snapshot);
    localStorage.setItem(historyKey, JSON.stringify(next.slice(0, 20)));
    renderHistory();
    log("Project prompts saved locally: " + state.project.id);
  }

  function newProject() {
    state.project = defaultProject();
    applyProjectToForm();
    renderAll();
    localStorage.setItem(projectKey, JSON.stringify(persistableProject(state.project)));
    log("New project created.");
  }

  function clearHistory() {
    localStorage.setItem(historyKey, "[]");
    renderHistory();
    log("History cleared.");
  }

  function renderAll() {
    renderProjectStatus();
    renderCharacters();
    renderSelectedCharacters();
    renderPanels();
    renderImagePrompts();
    renderImages();
    renderHistory();
    renderLogs();
  }

  function renderProjectStatus() {
    els.projectStatus.textContent = state.project.status || "draft";
  }

  function renderCharacters() {
    var series = els.seriesFilter.value;
    var query = els.characterSearch.value.trim().toLowerCase();
    var selected = new Set(state.project.characterIds);
    var list = data.characters.filter(function (character) {
      var fullID = character.series + "/" + character.id;
      if (series && character.series !== series) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        fullID,
        character.name,
        character.name_en,
        character.personality
      ].join(" ").toLowerCase().indexOf(query) !== -1;
    }).slice(0, 80);

    els.characterList.innerHTML = "";
    list.forEach(function (character) {
      var fullID = character.series + "/" + character.id;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "character-chip" + (selected.has(fullID) ? " selected" : "");
      button.textContent = character.name + " / " + character.id;
      button.title = fullID;
      button.addEventListener("click", function () {
        toggleCharacter(fullID);
      });
      els.characterList.appendChild(button);
    });
  }

  function renderSelectedCharacters() {
    els.selectedCharacters.innerHTML = "";
    if (state.project.characterIds.length === 0) {
      var empty = document.createElement("span");
      empty.className = "status-pill";
      empty.textContent = "未选择角色";
      els.selectedCharacters.appendChild(empty);
      return;
    }
    state.project.characterIds.forEach(function (id) {
      var character = getCharacter(id);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "character-chip selected";
      button.textContent = character ? character.name + " ×" : id + " ×";
      button.title = id;
      button.addEventListener("click", function () {
        toggleCharacter(id);
      });
      els.selectedCharacters.appendChild(button);
    });
  }

  function toggleCharacter(fullID) {
    var index = state.project.characterIds.indexOf(fullID);
    if (index === -1) {
      state.project.characterIds.push(fullID);
    } else {
      state.project.characterIds.splice(index, 1);
    }
    state.project.updatedAt = new Date().toISOString();
    renderCharacters();
    renderSelectedCharacters();
  }

  function buildStoryboardPrompt() {
    syncProjectFromForm();
    var characters = selectedCharacters();
    if (characters.length === 0) {
      state.project.storyboardPrompt = "";
      els.storyboardPrompt.value = "";
      log("Select at least one character before building the storyboard prompt.");
      return false;
    }
    if (!state.project.plotHint) {
      state.project.storyboardPrompt = "";
      els.storyboardPrompt.value = "";
      log("Plot hint is required.");
      return false;
    }

    var style = getStyle(state.project.style);
    state.project.storyboardPrompt = renderTemplate(data.storybookTemplate, {
      Characters: characters,
      PlotHint: state.project.plotHint,
      Language: normalizeLanguage(state.project.language),
      StyleDescription: style.description
    });
    state.project.status = "storyboard_prompt_ready";
    els.storyboardPrompt.value = state.project.storyboardPrompt;
    renderProjectStatus();
    setActiveTab("storyPrompt");
    log("Storyboard prompt built.");
    return true;
  }

  async function callLLM() {
    saveSettingsFromForm();
    if (!state.project.storyboardPrompt) {
      if (!buildStoryboardPrompt()) {
        return false;
      }
    }
    if (!state.project.storyboardPrompt) {
      return;
    }
    if (!state.settings.llmApiKey) {
      log("LLM API key is required in settings.");
      return false;
    }

    setBusy(els.callLLMBtn, true);
    try {
      log("Calling " + state.settings.llmProvider + " LLM in streaming mode: " + state.settings.llmModel);
      state.project.rawStoryboard = "";
      els.rawStoryboard.value = "";
      setActiveTab("storyboard");
      var text = await generateText(state.project.storyboardPrompt, appendStoryboardDelta);
      state.project.rawStoryboard = text;
      state.project.status = "storyboard_done";
      els.rawStoryboard.value = text;
      parseStoryboardFromRaw();
      saveProject();
      setActiveTab("storyboard");
      return true;
    } catch (err) {
      logError("LLM request failed", err);
      return false;
    } finally {
      setBusy(els.callLLMBtn, false);
    }
  }

  async function generateText(prompt, onDelta) {
    if (state.settings.llmProvider === "gemini") {
      return generateGeminiText(prompt, onDelta);
    }
    return generateOpenAIText(prompt, onDelta);
  }

  async function generateGeminiText(prompt, onDelta) {
    var endpoint = applyModelToEndpoint(state.settings.llmEndpoint, state.settings.llmModel);
    try {
      return await generateGeminiTextStream(streamEndpoint(endpoint), prompt, onDelta);
    } catch (err) {
      log("Gemini streaming failed, falling back to normal request: " + readableError(err));
      resetStoryboardOutput();
    }
    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": state.settings.llmApiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    var payload = await parseJSONResponse(response);
    var parts = (((payload.candidates || [])[0] || {}).content || {}).parts || [];
    var text = parts.map(function (part) {
      return part.text || "";
    }).join("");
    if (!text) {
      throw new Error("Gemini returned no text content.");
    }
    await appendTypewriter(text, onDelta);
    return text;
  }

  async function generateGeminiTextStream(endpoint, prompt, onDelta) {
    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": state.settings.llmApiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    return readSSEText(response, function (payload) {
      var parts = (((payload.candidates || [])[0] || {}).content || {}).parts || [];
      return parts.map(function (part) {
        return part.text || "";
      }).join("");
    }, onDelta);
  }

  async function generateOpenAIText(prompt, onDelta) {
    try {
      return await generateOpenAITextStream(prompt, onDelta);
    } catch (err) {
      log("OpenAI streaming failed, falling back to normal request: " + readableError(err));
      resetStoryboardOutput();
    }
    var response = await fetch(state.settings.llmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.settings.llmApiKey
      },
      body: JSON.stringify({
        model: state.settings.llmModel,
        messages: [{ role: "user", content: prompt }]
      })
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

  async function generateOpenAITextStream(prompt, onDelta) {
    var response = await fetch(state.settings.llmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.settings.llmApiKey
      },
      body: JSON.stringify({
        model: state.settings.llmModel,
        messages: [{ role: "user", content: prompt }],
        stream: true
      })
    });
    return readSSEText(response, function (payload) {
      var choice = (payload.choices || [])[0] || {};
      return choice.delta ? choice.delta.content || "" : "";
    }, onDelta);
  }

  function parseStoryboardFromRaw() {
    syncProjectFromForm();
    var blocks = extractCodeBlocks(state.project.rawStoryboard);
    if (blocks.length === 0 && state.project.rawStoryboard.trim()) {
      blocks = [state.project.rawStoryboard.trim()];
    }
    state.project.panels = blocks.map(function (content, index) {
      return {
        index: index + 1,
        content: content,
        characterIds: []
      };
    });
    state.project.status = blocks.length > 0 ? "storyboard_done" : state.project.status;
    renderPanels();
    renderProjectStatus();
    log("Parsed " + blocks.length + " storyboard block(s).");
  }

  function renderPanels() {
    els.panelList.innerHTML = "";
    state.project.panels.forEach(function (panel, index) {
      var card = document.createElement("div");
      card.className = "story-card";
      card.innerHTML = '<div class="card-head"><h3>分镜 ' + panel.index + '</h3><span>可编辑</span></div>';
      var textarea = document.createElement("textarea");
      textarea.value = panel.content;
      textarea.spellcheck = false;
      textarea.addEventListener("input", function () {
        state.project.panels[index].content = textarea.value;
        state.project.updatedAt = new Date().toISOString();
      });
      card.appendChild(textarea);
      els.panelList.appendChild(card);
    });
  }

  function buildImagePrompts() {
    syncProjectFromForm();
    if (state.project.panels.length === 0) {
      parseStoryboardFromRaw();
    }
    if (state.project.panels.length === 0) {
      log("Storyboard panels are required before building image prompts.");
      return;
    }
    var template = data.comicTemplates[state.project.style];
    var prompts = state.project.panels.map(function (panel) {
      var characters = charactersForPanel(panel);
      return {
        index: panel.index,
        prompt: renderTemplate(template, {
          Characters: characters,
          CharacterSetting: buildCharacterSetting(characters),
          PanelContent: panel.content,
          Language: normalizeLanguage(state.project.language)
        })
      };
    });
    state.project.imagePrompts = prompts;
    state.project.images = prompts.map(function (prompt) {
      return state.project.images.find(function (image) {
        return image.index === prompt.index;
      }) || { index: prompt.index, status: "pending", dataUrl: "", error: "" };
    });
    state.project.status = "image_prompt_ready";
    renderImagePrompts();
    renderImages();
    renderProjectStatus();
    setActiveTab("imagePrompts");
    log("Built " + prompts.length + " image prompt(s).");
  }

  function renderImagePrompts() {
    els.imagePromptList.innerHTML = "";
    state.project.imagePrompts.forEach(function (item, index) {
      var card = document.createElement("div");
      card.className = "prompt-card";
      var head = document.createElement("div");
      head.className = "card-head";
      head.innerHTML = "<h3>图片 Prompt " + item.index + "</h3>";
      var copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "复制";
      copy.addEventListener("click", function () {
        copyText(item.prompt);
      });
      head.appendChild(copy);
      var textarea = document.createElement("textarea");
      textarea.value = item.prompt;
      textarea.spellcheck = false;
      textarea.addEventListener("input", function () {
        state.project.imagePrompts[index].prompt = textarea.value;
        state.project.updatedAt = new Date().toISOString();
      });
      card.appendChild(head);
      card.appendChild(textarea);
      els.imagePromptList.appendChild(card);
    });
  }

  async function callImageAPI() {
    saveSettingsFromForm();
    if (state.project.imagePrompts.length === 0) {
      buildImagePrompts();
    }
    if (state.project.imagePrompts.length === 0) {
      return;
    }
    if (!state.settings.imageApiKey) {
      log("Image API key is required in settings.");
      return false;
    }

    setBusy(els.callImageBtn, true);
    var allDone = true;
    try {
      for (var i = 0; i < state.project.imagePrompts.length; i++) {
        var item = state.project.imagePrompts[i];
        log("Generating image " + item.index + " with " + state.settings.imageProvider + "/" + state.settings.imageModel);
        try {
          var result = await generateImage(item.prompt);
          triggerImageDownload(item.index, result.dataUrl);
          updateImageResult(item.index, { status: "downloaded", dataUrl: result.dataUrl, url: result.url || "", error: "" });
          log("Image " + item.index + " generated and download started.");
        } catch (err) {
          allDone = false;
          updateImageResult(item.index, { status: "failed", dataUrl: "", url: "", error: readableError(err) });
          logError("Image " + item.index + " failed", err);
        }
        renderImages();
        saveProject();
      }
      state.project.status = state.project.images.every(function (image) {
        return image.status === "downloaded";
      }) ? "images_done" : "image_partial";
      renderProjectStatus();
      setActiveTab("images");
      return allDone;
    } finally {
      setBusy(els.callImageBtn, false);
    }
  }

  async function runFullAuto() {
    setBusy(els.fullAutoBtn, true);
    try {
      log("Full auto flow started.");
      if (!buildStoryboardPrompt()) {
        return;
      }
      var llmOK = await callLLM();
      if (!llmOK) {
        log("Full auto stopped at LLM step.");
        return;
      }
      buildImagePrompts();
      if (state.project.imagePrompts.length === 0) {
        log("Full auto stopped before image generation.");
        return;
      }
      var imageOK = await callImageAPI();
      if (imageOK) {
        log("Full auto flow completed.");
      } else {
        log("Full auto flow completed with image errors.");
      }
    } finally {
      setBusy(els.fullAutoBtn, false);
    }
  }

  async function generateImage(prompt) {
    if (state.settings.imageProvider === "gemini") {
      return generateGeminiImage(prompt);
    }
    return generateOpenAIImage(prompt);
  }

  async function generateGeminiImage(prompt) {
    var endpoint = applyModelToEndpoint(state.settings.imageEndpoint, state.settings.imageModel);
    var response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": state.settings.imageApiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: "9:16",
            imageSize: state.settings.geminiImageSize
          }
        }
      })
    });
    var payload = await parseJSONResponse(response);
    var parts = (((payload.candidates || [])[0] || {}).content || {}).parts || [];
    for (var i = 0; i < parts.length; i++) {
      var inlineData = parts[i].inlineData || parts[i].inline_data;
      if (inlineData && inlineData.data) {
        return {
          dataUrl: "data:" + (inlineData.mimeType || inlineData.mime_type || "image/png") + ";base64," + inlineData.data
        };
      }
    }
    throw new Error("Gemini returned no inline image data.");
  }

  async function generateOpenAIImage(prompt) {
    var response = await fetch(state.settings.imageEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.settings.imageApiKey
      },
      body: JSON.stringify({
        model: state.settings.imageModel,
        prompt: prompt,
        size: "1024x1536",
        quality: "high",
        output_format: "png",
        n: 1
      })
    });
    var payload = await parseJSONResponse(response);
    var image = (payload.data || [])[0];
    if (!image) {
      throw new Error("OpenAI returned no image data.");
    }
    if (image.b64_json) {
      return { dataUrl: "data:image/png;base64," + stripDataPrefix(image.b64_json) };
    }
    if (image.url) {
      return { dataUrl: image.url, url: image.url };
    }
    throw new Error("OpenAI returned no b64_json or url field.");
  }

  function renderImages() {
    els.imageList.innerHTML = "";
    state.project.images.forEach(function (image) {
      var card = document.createElement("div");
      card.className = "image-card";
      var head = document.createElement("div");
      head.className = "card-head";
      head.innerHTML = '<h3>图片 ' + image.index + '</h3><span>' + image.status + '</span>';
      card.appendChild(head);
      if (image.dataUrl) {
        var img = document.createElement("img");
        img.src = image.dataUrl;
        img.alt = "Generated image " + image.index;
        card.appendChild(img);
        var open = document.createElement("a");
        open.href = image.dataUrl;
        open.download = "panel-" + String(image.index).padStart(3, "0") + ".png";
        open.textContent = "重新下载";
        card.appendChild(open);
      }
      if (image.error) {
        var error = document.createElement("div");
        error.className = "error";
        error.textContent = image.error;
        card.appendChild(error);
      }
      els.imageList.appendChild(card);
    });
  }

  function updateImageResult(index, patch) {
    var current = state.project.images.find(function (image) {
      return image.index === index;
    });
    if (!current) {
      current = { index: index, status: "pending", dataUrl: "", error: "" };
      state.project.images.push(current);
    }
    Object.assign(current, patch);
    state.project.updatedAt = new Date().toISOString();
  }

  function renderHistory() {
    var history = readHistory();
    els.historyList.innerHTML = "";
    if (history.length === 0) {
      var empty = document.createElement("span");
      empty.className = "status-pill";
      empty.textContent = "暂无历史";
      els.historyList.appendChild(empty);
      return;
    }
    history.forEach(function (item) {
      var wrap = document.createElement("div");
      wrap.className = "history-item";
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = (item.plotHint || "未命名项目").slice(0, 46);
      button.addEventListener("click", function () {
        state.project = hydrateProject(item);
        applyProjectToForm();
        renderAll();
        localStorage.setItem(projectKey, JSON.stringify(persistableProject(state.project)));
        log("Loaded project: " + item.id);
      });
      var meta = document.createElement("span");
      meta.textContent = item.status + " · " + formatDate(item.updatedAt);
      wrap.appendChild(button);
      wrap.appendChild(meta);
      els.historyList.appendChild(wrap);
    });
  }

  function renderLogs() {
    els.logOutput.textContent = state.logs.join("\n");
  }

  function log(message) {
    state.logs.push("[" + new Date().toLocaleTimeString() + "] " + message);
    renderLogs();
  }

  function logError(prefix, err) {
    log(prefix + ": " + readableError(err));
  }

  function selectedCharacters() {
    return state.project.characterIds.map(getCharacter).filter(Boolean);
  }

  function charactersForPanel(panel) {
    if (!panel.characterIds || panel.characterIds.length === 0) {
      return selectedCharacters();
    }
    return panel.characterIds.map(getCharacter).filter(Boolean);
  }

  function getCharacter(fullID) {
    return data.characters.find(function (character) {
      return character.series + "/" + character.id === fullID;
    });
  }

  function getStyle(styleID) {
    return data.styles.find(function (style) {
      return style.id === styleID;
    }) || data.styles[0];
  }

  function buildCharacterSetting(characters) {
    var lines = ["> 注：此处设定不可变的生理特征，后续分镜中不再赘述"];
    characters.forEach(function (c) {
      lines.push("");
      lines.push("- **" + c.name + "**：");
      lines.push("  - **发型与发色**：" + c.appearance.hair_style + " / " + c.appearance.hair_color);
      lines.push("  - **眼型与瞳色**：" + c.appearance.eye_shape + " / " + c.appearance.eye_color);
      lines.push("  - **身高与身材**：" + c.appearance.height + " / " + c.appearance.body_type);
      lines.push("  - **其他特征**：" + c.appearance.other);
    });
    return lines.join("\n");
  }

  function renderTemplate(template, context) {
    var rendered = template.replace(/\{\{\-?\s*range\s+\.Characters\s*\}\}([\s\S]*?)\{\{\-?\s*end\s*\}\}/g, function (_, block) {
      return (context.Characters || []).map(function (character) {
        return renderVariables(block, Object.assign({}, context, { ".": character }));
      }).join("");
    });
    return renderVariables(rendered, context);
  }

  function renderVariables(template, context) {
    return template.replace(/\{\{\-?\s*([^{}]+?)\s*\-?\}\}/g, function (_, expression) {
      return valueForExpression(expression.trim(), context);
    });
  }

  function valueForExpression(expression, context) {
    if (expression.indexOf(".") !== 0) {
      return "";
    }
    var root = context["."] || context;
    var path = expression.slice(1).split(".");
    var value = root;
    if (context["."] && path[0] && Object.prototype.hasOwnProperty.call(context, path[0])) {
      value = context;
    }
    for (var i = 0; i < path.length; i++) {
      if (!path[i]) {
        continue;
      }
      value = getTemplateValue(value, path[i]);
    }
    return value == null ? "" : String(value);
  }

  function getTemplateValue(value, key) {
    if (!value) {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
    return value[toJSKey(key)];
  }

  function toJSKey(key) {
    return key
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase();
  }

  function extractCodeBlocks(markdown) {
    var blocks = [];
    var re = /```[^\n]*\n([\s\S]*?)```/g;
    var match;
    while ((match = re.exec(markdown)) !== null) {
      blocks.push(match[1].replace(/\n$/, ""));
    }
    return blocks;
  }

  async function parseJSONResponse(response) {
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

  async function readSSEText(response, extractDelta, onDelta) {
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

  async function appendTypewriter(text, onDelta) {
    if (!onDelta || !text) {
      return;
    }
    var chunkSize = 8;
    for (var i = 0; i < text.length; i += chunkSize) {
      onDelta(text.slice(i, i + chunkSize));
      await delay(12);
    }
  }

  function appendStoryboardDelta(delta) {
    state.project.rawStoryboard += delta;
    els.rawStoryboard.value = state.project.rawStoryboard;
    els.rawStoryboard.scrollTop = els.rawStoryboard.scrollHeight;
  }

  function resetStoryboardOutput() {
    state.project.rawStoryboard = "";
    els.rawStoryboard.value = "";
  }

  function applyModelToEndpoint(endpoint, model) {
    if (endpoint.indexOf("{model}") !== -1) {
      return endpoint.replace(/\{model\}/g, encodeURIComponent(model));
    }
    return endpoint;
  }

  function streamEndpoint(endpoint) {
    var streamed = endpoint.replace(":generateContent", ":streamGenerateContent");
    return streamed.indexOf("?") === -1 ? streamed + "?alt=sse" : streamed + "&alt=sse";
  }

  function setActiveTab(id) {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.classList.toggle("active", tab.dataset.tab === id);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === id);
    });
  }

  function setBusy(button, busy) {
    button.disabled = busy;
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(function () {
      log("Copied to clipboard.");
    }).catch(function () {
      log("Clipboard API is unavailable in this browser context.");
    });
  }

  function downloadProject() {
    syncProjectFromForm();
    var blob = new Blob([JSON.stringify(persistableProject(state.project), null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "lovelive-engine-project-" + state.project.id + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function readHistory() {
    return readJSON(historyKey, []).map(hydrateProject).map(persistableProject);
  }

  function hydrateProject(project) {
    var hydrated = merge(defaultProject(), project);
    hydrated.images = [];
    return hydrated;
  }

  function persistableProject(project) {
    var snapshot = merge({}, project);
    snapshot.images = [];
    return snapshot;
  }

  function triggerImageDownload(index, dataUrl) {
    var link = document.createElement("a");
    link.href = dataUrl;
    link.download = "panel-" + String(index).padStart(3, "0") + ".png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function merge(base, patch) {
    return Object.assign({}, base, patch || {});
  }

  function normalizeLanguage(language) {
    return language.trim() || "中文";
  }

  function makeID() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "project-" + Date.now();
  }

  function stripDataPrefix(value) {
    var index = value.indexOf("base64,");
    return index === -1 ? value : value.slice(index + 7);
  }

  function readableError(err) {
    if (!err) {
      return "Unknown error";
    }
    if (err instanceof TypeError && String(err.message).toLowerCase().indexOf("fetch") !== -1) {
      return err.message + "\n可能是 CORS、网络连接或浏览器阻止了跨域请求。";
    }
    return err.message || String(err);
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    return new Date(value).toLocaleString();
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }
})();
