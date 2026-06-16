(function () {
  "use strict";

  var data = window.LLE_DATA;
  var settingsKey = "lovelive-engine-web-settings";
  var projectKey = "lovelive-engine-web-project";
  var historyKey = "lovelive-engine-web-history";
  var state = {
    settings: defaultSettings(),
    project: defaultProject(),
    projectSaved: false,
    settingsCollapsed: true,
    imageUI: {
      activeIndex: null
    },
    standardUI: {
      step: "prompt"
    },
    longMangaUI: {
      step: "outline",
      activeEpisode: null
    },
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
      "fullAutoBtn", "saveProjectBtn", "newProjectBtn", "settingsPanel", "settingsToggleBtn", "settingsBody", "saveSettingsBtn", "clearHistoryBtn",
      "llmProvider", "llmEndpoint", "llmApiKey", "llmModel",
      "imageProvider", "imageEndpoint", "imageApiKey", "imageModel", "geminiImageSize", "geminiImageSizeWrap",
      "historyList", "projectStatus", "seriesFilter", "characterSearch", "styleSelect", "storyMode", "languageInput",
      "standardStepPromptTab", "standardStepImagesTab",
      "standardStepPromptPanel", "standardStepImagesPanel",
      "characterList", "selectedCharacters", "plotHint", "buildStoryboardPromptBtn", "callLLMBtn",
      "storyboardPrompt", "rawStoryboard", "parseStoryboardBtn", "buildImagePromptsBtn",
      "longStepOutlineTab", "longStepEpisodesTab", "longStepImagesTab",
      "longStepOutlinePanel", "longStepEpisodesPanel", "longStepImagesPanel",
      "buildLongOutlinePromptBtn", "callLongOutlineBtn", "parseLongOutlineBtn", "nextLongOutlineBtn",
      "buildLongEpisodePromptsBtn", "callLongEpisodesBtn", "parseLongEpisodeBtn", "nextLongEpisodesBtn",
      "longOutlinePrompt", "rawLongOutline", "longOutlineSummary", "longEpisodeTabs", "longEpisodeList",
      "buildLongImagePromptsBtn", "callLongImageBtn", "longImageTabs", "longImagePromptList", "longImageList",
      "panelList", "imagePromptTabs", "imagePromptList", "callImageBtn", "imageList", "downloadProjectBtn",
      "clearLogBtn", "logOutput"
    ].forEach(function (id) {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.saveSettingsBtn.addEventListener("click", saveSettingsFromForm);
    els.settingsToggleBtn.addEventListener("click", toggleSettingsPanel);
    els.fullAutoBtn.addEventListener("click", runFullAuto);
    els.saveProjectBtn.addEventListener("click", saveProject);
    els.newProjectBtn.addEventListener("click", newProject);
    els.clearHistoryBtn.addEventListener("click", clearHistory);
    els.llmProvider.addEventListener("change", onLLMProviderChange);
    els.imageProvider.addEventListener("change", onImageProviderChange);
    els.seriesFilter.addEventListener("change", renderCharacters);
    els.characterSearch.addEventListener("input", renderCharacters);
    els.styleSelect.addEventListener("change", syncProjectFromForm);
    els.storyMode.addEventListener("change", function () {
      syncProjectFromForm();
      updateRouteUI();
      setActiveTab(firstTabForMode(state.project.storyMode));
    });
    els.languageInput.addEventListener("input", syncProjectFromForm);
    els.plotHint.addEventListener("input", syncProjectFromForm);
    els.buildStoryboardPromptBtn.addEventListener("click", buildStoryboardPrompt);
    els.callLLMBtn.addEventListener("click", callLLM);
    els.standardStepPromptTab.addEventListener("click", function () {
      setStandardStep("prompt");
    });
    els.standardStepImagesTab.addEventListener("click", function () {
      setStandardStep("images");
    });
    els.rawStoryboard.addEventListener("input", updateRawStoryboardFromInput);
    els.parseStoryboardBtn.addEventListener("click", parseStoryboardFromRaw);
    els.buildImagePromptsBtn.addEventListener("click", buildImagePrompts);
    els.buildLongOutlinePromptBtn.addEventListener("click", buildLongOutlinePrompt);
    els.callLongOutlineBtn.addEventListener("click", callLongOutline);
    els.rawLongOutline.addEventListener("input", updateRawLongOutlineFromInput);
    els.parseLongOutlineBtn.addEventListener("click", parseLongOutlineFromRaw);
    els.nextLongOutlineBtn.addEventListener("click", goToLongEpisodesStep);
    els.buildLongEpisodePromptsBtn.addEventListener("click", buildLongEpisodePrompts);
    els.callLongEpisodesBtn.addEventListener("click", callLongEpisodes);
    els.parseLongEpisodeBtn.addEventListener("click", parseActiveLongEpisode);
    els.nextLongEpisodesBtn.addEventListener("click", goToLongImagesStep);
    els.longStepOutlineTab.addEventListener("click", function () {
      setLongMangaStep("outline");
    });
    els.longStepEpisodesTab.addEventListener("click", function () {
      setLongMangaStep("episodes");
    });
    els.longStepImagesTab.addEventListener("click", function () {
      setLongMangaStep("images");
    });
    els.buildLongImagePromptsBtn.addEventListener("click", buildLongImagePromptsStep);
    els.callLongImageBtn.addEventListener("click", callImageAPI);
    els.callImageBtn.addEventListener("click", callImageAPI);
    els.downloadProjectBtn.addEventListener("click", downloadProject);
    els.clearLogBtn.addEventListener("click", function () {
      state.logs = [];
      renderLogs();
    });

    document.querySelectorAll("[data-copy]").forEach(function (button) {
      button.addEventListener("click", function () {
        copyText(els[button.dataset.copy].value || "");
      });
    });

    window.addEventListener("beforeunload", function () {
      syncProjectFromForm();
      autoSaveProject();
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
      storyMode: "standard",
      language: "中文",
      storyboardPrompt: "",
      rawStoryboard: "",
      panels: [],
      imagePrompts: [],
      images: [],
      longOutlinePrompt: "",
      rawLongOutline: "",
      longOutline: null,
      longEpisodePrompts: [],
      longEpisodeRaws: [],
      longEpisodes: [],
      characterCostumes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function loadState() {
    state.settings = merge(defaultSettings(), readJSON(settingsKey, {}));
    var savedProject = readJSON(projectKey, null);
    state.project = savedProject ? hydrateProject(savedProject) : defaultProject();
    state.projectSaved = !!savedProject;
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
    els.storyMode.value = state.project.storyMode || "standard";
    els.languageInput.value = state.project.language;
    els.plotHint.value = state.project.plotHint;
    els.storyboardPrompt.value = state.project.storyboardPrompt;
    els.rawStoryboard.value = state.project.rawStoryboard;
    els.longOutlinePrompt.value = state.project.longOutlinePrompt || "";
    els.rawLongOutline.value = state.project.rawLongOutline || "";
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
    setSettingsCollapsed(true);
    log("Settings saved locally.");
  }

  function syncProjectFromForm() {
    state.project.style = els.styleSelect.value;
    state.project.storyMode = els.storyMode.value;
    state.project.language = normalizeLanguage(els.languageInput.value);
    state.project.plotHint = els.plotHint.value.trim();
    state.project.storyboardPrompt = els.storyboardPrompt.value;
    state.project.rawStoryboard = els.rawStoryboard.value;
    state.project.longOutlinePrompt = els.longOutlinePrompt.value;
    state.project.rawLongOutline = els.rawLongOutline.value;
    state.project.updatedAt = new Date().toISOString();
    renderProjectStatus();
  }

  function updateRawStoryboardFromInput() {
    state.project.rawStoryboard = els.rawStoryboard.value;
    state.project.updatedAt = new Date().toISOString();
    autoSaveProject();
  }

  function updateRawLongOutlineFromInput() {
    state.project.rawLongOutline = els.rawLongOutline.value;
    state.project.updatedAt = new Date().toISOString();
    autoSaveProject();
  }

  function saveProject() {
    syncProjectFromForm();
    state.projectSaved = true;
    persistProject();
    log("Project prompts saved locally: " + state.project.id);
  }

  function autoSaveProject() {
    if (!state.projectSaved) {
      return;
    }
    persistProject();
  }

  function persistProject() {
    var snapshot = persistableProject(state.project);
    localStorage.setItem(projectKey, JSON.stringify(snapshot));
    var history = readHistory();
    var next = history.filter(function (item) {
      return item.id !== snapshot.id;
    });
    next.unshift(snapshot);
    localStorage.setItem(historyKey, JSON.stringify(next.slice(0, 20)));
    renderHistory();
  }

  function newProject() {
    state.project = defaultProject();
    state.projectSaved = false;
    applyProjectToForm();
    renderAll();
    localStorage.removeItem(projectKey);
    log("New project created.");
  }

  function clearHistory() {
    localStorage.setItem(historyKey, "[]");
    renderHistory();
    log("History cleared.");
  }

  function renderAll() {
    updateRouteUI();
    renderStandardFlow();
    renderProjectStatus();
    renderCharacters();
    renderSelectedCharacters();
    renderPanels();
    renderLongManga();
    renderImagePrompts();
    renderImages();
    renderHistory();
    renderLogs();
    renderSettingsPanel();
  }

  function toggleSettingsPanel() {
    setSettingsCollapsed(!state.settingsCollapsed);
  }

  function setSettingsCollapsed(collapsed) {
    state.settingsCollapsed = collapsed;
    renderSettingsPanel();
  }

  function renderSettingsPanel() {
    els.settingsPanel.classList.toggle("collapsed", state.settingsCollapsed);
    els.settingsToggleBtn.textContent = state.settingsCollapsed ? "展开" : "收起";
    els.settingsToggleBtn.setAttribute("aria-expanded", String(!state.settingsCollapsed));
  }

  function setStandardStep(step) {
    state.standardUI.step = step;
    renderStandardFlow();
  }

  function renderStandardFlow() {
    var step = state.standardUI.step;
    els.standardStepPromptTab.classList.toggle("active", step === "prompt");
    els.standardStepImagesTab.classList.toggle("active", step === "images");
    els.standardStepPromptPanel.classList.toggle("is-hidden", step !== "prompt");
    els.standardStepImagesPanel.classList.toggle("is-hidden", step !== "images");
  }

  function setLongMangaStep(step) {
    state.longMangaUI.step = step;
    renderLongManga();
  }

  function setActiveLongEpisode(episodeNumber) {
    state.longMangaUI.activeEpisode = episodeNumber;
    renderLongManga();
  }

  function parseActiveLongEpisode() {
    var item = activeLongEpisodePrompt();
    if (!item) {
      log("Long manga episode prompt is required before parsing.");
      return false;
    }
    return parseLongEpisodeFromRaw(item.episode);
  }

  function goToLongEpisodesStep() {
    if (!state.project.longOutline && !parseLongOutlineFromRaw()) {
      return false;
    }
    if (state.project.longEpisodePrompts.length === 0 && !buildLongEpisodePrompts()) {
      return false;
    }
    setLongMangaStep("episodes");
    log("Moved to long manga episode prompts.");
    return true;
  }

  function goToLongImagesStep() {
    if (!ensureLongEpisodesParsed()) {
      return false;
    }
    applyLongEpisodesToPanels();
    renderPanels();
    buildLongImagePromptsStep();
    setLongMangaStep("images");
    log("Moved to long manga image prompts.");
    return true;
  }

  function ensureLongEpisodesParsed() {
    if (state.project.longEpisodePrompts.length === 0 && !buildLongEpisodePrompts()) {
      return false;
    }
    var allDone = true;
    state.project.longEpisodePrompts.forEach(function (item) {
      var exists = (state.project.longEpisodes || []).some(function (episode) {
        return episode.episode === item.episode;
      });
      if (!exists) {
        state.longMangaUI.activeEpisode = item.episode;
        if (!parseLongEpisodeFromRaw(item.episode)) {
          allDone = false;
        }
      }
    });
    return allDone;
  }

  function renderProjectStatus() {
    els.projectStatus.textContent = state.project.status || "draft";
  }

  function updateRouteUI() {
    var mode = state.project.storyMode || "standard";
    document.querySelectorAll("[data-route]").forEach(function (element) {
      element.hidden = element.dataset.route !== mode;
    });
    setActiveTab(firstTabForMode(mode));
    els.fullAutoBtn.textContent = mode === "long" ? "全自动执行长漫画" : "全自动执行标准漫画";
  }

  function firstTabForMode(mode) {
    return mode === "long" ? "longManga" : "storyPrompt";
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
    setStandardStep("prompt");
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
      setActiveTab("storyPrompt");
      setStandardStep("prompt");
      var text = await generateText(state.project.storyboardPrompt, appendStoryboardDelta, resetStoryboardOutput);
      state.project.rawStoryboard = text;
      state.project.status = "storyboard_done";
      els.rawStoryboard.value = text;
      parseStoryboardFromRaw();
      autoSaveProject();
      setActiveTab("storyPrompt");
      return true;
    } catch (err) {
      logError("LLM request failed", err);
      return false;
    } finally {
      setBusy(els.callLLMBtn, false);
    }
  }

  async function generateText(prompt, onDelta, onReset) {
    if (state.settings.llmProvider === "gemini") {
      return generateGeminiText(prompt, onDelta, onReset);
    }
    return generateOpenAIText(prompt, onDelta, onReset);
  }

  async function generateGeminiText(prompt, onDelta, onReset) {
    var endpoint = applyModelToEndpoint(state.settings.llmEndpoint, state.settings.llmModel);
    try {
      return await generateGeminiTextStream(streamEndpoint(endpoint), prompt, onDelta);
    } catch (err) {
      log("Gemini streaming failed, falling back to normal request: " + readableError(err));
      if (onReset) {
        onReset();
      }
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

  async function generateOpenAIText(prompt, onDelta, onReset) {
    try {
      return await generateOpenAITextStream(prompt, onDelta);
    } catch (err) {
      log("OpenAI streaming failed, falling back to normal request: " + readableError(err));
      if (onReset) {
        onReset();
      }
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

  function parseStoryboardFromRaw(skipImagePrompts) {
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
    autoSaveProject();
    if (blocks.length > 0) {
      if (!skipImagePrompts) {
        buildImagePrompts();
      } else {
        setStandardStep("images");
      }
    }
    log("Parsed " + blocks.length + " storyboard block(s).");
    return blocks.length > 0;
  }

  function renderPanels() {
    els.panelList.innerHTML = "";
    state.project.panels.forEach(function (panel, index) {
      var card = document.createElement("div");
      card.className = "story-card";
      card.innerHTML = '<div class="card-head"><h3>分镜 ' + panel.index + '</h3><span>可编辑</span></div>';
      var textarea = document.createElement("textarea");
      textarea.value = panel.content;
      textarea.placeholder = "这里是解析后的单个分镜内容；确认或微调后，进入下一步生成图片 Prompt。";
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
    if ((state.project.storyMode || "standard") === "long" && state.project.panels.length === 0) {
      applyLongEpisodesToPanels();
    }
    if (state.project.panels.length === 0) {
      parseStoryboardFromRaw(true);
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
    if ((state.project.storyMode || "standard") === "long") {
      state.longMangaUI.step = "images";
      renderLongManga();
      setActiveTab("longManga");
    } else {
      setActiveTab("storyPrompt");
      setStandardStep("images");
    }
    log("Built " + prompts.length + " image prompt(s).");
  }

  function buildLongImagePromptsStep() {
    buildImagePrompts();
    if (state.project.imagePrompts.length > 0) {
      state.longMangaUI.step = "images";
      renderLongManga();
      setActiveTab("longManga");
      return true;
    }
    return false;
  }

  function buildLongOutlinePrompt() {
    syncProjectFromForm();
    var characters = selectedCharacters();
    if (characters.length === 0) {
      state.project.longOutlinePrompt = "";
      els.longOutlinePrompt.value = "";
      log("Select at least one character before building the long manga outline prompt.");
      return false;
    }
    if (!state.project.plotHint) {
      state.project.longOutlinePrompt = "";
      els.longOutlinePrompt.value = "";
      log("Plot hint is required.");
      return false;
    }

    state.project.longOutlinePrompt = renderTemplate(data.longOutlineTemplate, {
      Characters: characters,
      PlotHint: state.project.plotHint,
      Language: normalizeLanguage(state.project.language)
    });
    els.longOutlinePrompt.value = state.project.longOutlinePrompt;
    state.project.status = "long_outline_prompt_ready";
    state.longMangaUI.step = "outline";
    renderProjectStatus();
    renderLongManga();
    setActiveTab("longManga");
    log("Long manga outline prompt built.");
    return true;
  }

  async function callLongOutline() {
    saveSettingsFromForm();
    if (!state.project.longOutlinePrompt && !buildLongOutlinePrompt()) {
      return false;
    }
    if (!state.settings.llmApiKey) {
      log("LLM API key is required in settings.");
      return false;
    }

    setBusy(els.callLongOutlineBtn, true);
    try {
      state.project.rawLongOutline = "";
      els.rawLongOutline.value = "";
      setActiveTab("longManga");
      var text = await generateText(state.project.longOutlinePrompt, appendLongOutlineDelta, resetLongOutlineOutput);
      state.project.rawLongOutline = text;
      els.rawLongOutline.value = text;
      parseLongOutlineFromRaw();
      state.longMangaUI.step = "outline";
      autoSaveProject();
      return true;
    } catch (err) {
      logError("Long manga outline request failed", err);
      return false;
    } finally {
      setBusy(els.callLongOutlineBtn, false);
    }
  }

  function parseLongOutlineFromRaw() {
    syncProjectFromForm();
    try {
      var outline = normalizeLongOutline(parseJSONBlock(state.project.rawLongOutline));
      state.project.longOutline = outline;
      state.project.status = "long_outline_done";
      state.longMangaUI.step = "outline";
      renderLongManga();
      renderProjectStatus();
      autoSaveProject();
      log("Parsed long manga outline with " + outline.episodes.length + " episode(s).");
      return true;
    } catch (err) {
      logError("Failed to parse long manga outline", err);
      return false;
    }
  }

  function buildLongEpisodePrompts() {
    syncProjectFromForm();
    if (!state.project.longOutline && !parseLongOutlineFromRaw()) {
      return false;
    }

    var style = getStyle(state.project.style);
    state.project.longEpisodePrompts = state.project.longOutline.episodes.map(function (episode) {
      var characters = resolveCharacters(episode.character_ids);
      return {
        episode: episode.episode,
        prompt: renderTemplate(data.longEpisodeTemplate, {
          Characters: characters,
          CharacterCostumes: costumeStatesForEpisode(episode.character_ids),
          FullOutline: state.project.longOutline,
          Episode: episode,
          Language: normalizeLanguage(state.project.language),
          StyleDescription: style.description
        })
      };
    });
    state.project.status = "long_episode_prompts_ready";
    state.longMangaUI.step = "episodes";
    renderLongManga();
    renderProjectStatus();
    setActiveTab("longManga");
    log("Built " + state.project.longEpisodePrompts.length + " long manga episode prompt(s).");
    return true;
  }

  async function callLongEpisodes() {
    saveSettingsFromForm();
    if (state.project.longEpisodePrompts.length === 0 && !buildLongEpisodePrompts()) {
      return false;
    }
    if (!state.settings.llmApiKey) {
      log("LLM API key is required in settings.");
      return false;
    }

    setBusy(els.callLongEpisodesBtn, true);
    var allDone = true;
    try {
      for (var i = 0; i < state.project.longEpisodePrompts.length; i++) {
        var item = state.project.longEpisodePrompts[i];
        state.longMangaUI.activeEpisode = item.episode;
        setLongEpisodeRaw(item.episode, "");
        renderLongManga();
        try {
          log("Generating long manga episode " + item.episode + ".");
          var text = await generateText(item.prompt, appendLongEpisodeDelta(item.episode), resetLongEpisodeOutput(item.episode));
          setLongEpisodeRaw(item.episode, text);
          parseLongEpisodeFromRaw(item.episode);
          autoSaveProject();
        } catch (err) {
          allDone = false;
          logError("Long manga episode " + item.episode + " failed", err);
        }
      }
      applyLongEpisodesToPanels();
      renderPanels();
      renderProjectStatus();
      state.longMangaUI.step = "episodes";
      renderLongManga();
      return allDone;
    } finally {
      setBusy(els.callLongEpisodesBtn, false);
    }
  }

  function parseLongEpisodeFromRaw(episodeNumber) {
    var raw = getLongEpisodeRaw(episodeNumber);
    var outline = findLongOutlineEpisode(episodeNumber);
    if (!outline) {
      log("Episode " + episodeNumber + " is not in the current outline.");
      return false;
    }
    try {
      var script = normalizeLongEpisode(parseJSONBlock(raw), outline);
      upsertLongEpisode(script);
      mergeCostumeStates(script.costume_states || []);
      state.project.status = "long_episode_done";
      syncLongMangaImagePrompts();
      renderLongManga();
      autoSaveProject();
      log("Parsed long manga episode " + episodeNumber + ".");
      return true;
    } catch (err) {
      logError("Failed to parse long manga episode " + episodeNumber, err);
      return false;
    }
  }

  function renderLongManga() {
    els.longOutlinePrompt.value = state.project.longOutlinePrompt || "";
    els.rawLongOutline.value = state.project.rawLongOutline || "";
    renderLongMangaSections();
    renderLongOutlineSummary();
    renderLongEpisodeList();
    renderLongImages();
  }

  function renderLongMangaSections() {
    var step = state.longMangaUI.step;
    els.longStepOutlineTab.classList.toggle("active", step === "outline");
    els.longStepEpisodesTab.classList.toggle("active", step === "episodes");
    els.longStepImagesTab.classList.toggle("active", step === "images");
    els.longStepOutlinePanel.classList.toggle("is-hidden", step !== "outline");
    els.longStepEpisodesPanel.classList.toggle("is-hidden", step !== "episodes");
    els.longStepImagesPanel.classList.toggle("is-hidden", step !== "images");
  }

  function renderLongOutlineSummary() {
    els.longOutlineSummary.innerHTML = "";
    if (!state.project.longOutline || !state.project.longOutline.episodes) {
      return;
    }
    state.project.longOutline.episodes.forEach(function (episode) {
      var card = document.createElement("div");
      card.className = "story-card";
      card.innerHTML = '<div class="card-head"><h3>第 ' + episode.episode + ' 话《' + escapeHTML(episode.title) + '》</h3><span>' + (episode.character_ids || []).join(", ") + '</span></div>';
      var text = document.createElement("div");
      text.textContent = episode.summary;
      card.appendChild(text);
      els.longOutlineSummary.appendChild(card);
    });
  }

  function renderLongEpisodeList() {
    els.longEpisodeList.innerHTML = "";
    renderLongEpisodeTabs();

    var item = activeLongEpisodePrompt();
    if (!item) {
      var empty = document.createElement("span");
      empty.className = "status-pill";
      empty.textContent = "暂无逐话 Prompt";
      els.longEpisodeList.appendChild(empty);
      return;
    }

    var card = document.createElement("div");
    card.className = "prompt-card";
    var head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = "<h3>第 " + item.episode + " 话分镜脚本</h3>";
    var copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "复制 Prompt";
    copy.addEventListener("click", function () {
      copyText(item.prompt);
    });
    var parse = document.createElement("button");
    parse.type = "button";
    parse.textContent = "解析本话结果";
    parse.addEventListener("click", function () {
      parseLongEpisodeFromRaw(item.episode);
    });
    var actions = document.createElement("div");
    actions.className = "inline-actions";
    actions.appendChild(copy);
    actions.appendChild(parse);
    head.appendChild(actions);

    var promptArea = document.createElement("textarea");
    promptArea.value = item.prompt;
    promptArea.placeholder = "先解析长漫画梗概，再点击“生成逐话 Prompt”得到本话分镜提示词。";
    promptArea.spellcheck = false;
    promptArea.addEventListener("input", function () {
      item.prompt = promptArea.value;
      state.project.updatedAt = new Date().toISOString();
    });

      var rawArea = document.createElement("textarea");
      rawArea.value = getLongEpisodeRaw(item.episode);
      rawArea.placeholder = "将本话 Prompt 交给 LLM 后，把返回的分镜结果粘贴到这里，再解析本话内容。";
      rawArea.spellcheck = false;
      rawArea.addEventListener("input", function () {
        setLongEpisodeRaw(item.episode, rawArea.value, true);
      });

    card.appendChild(head);
    appendField(card, "本话 Prompt", promptArea);
    appendField(card, "本话结果", rawArea);
    appendLongEpisodeParsedSummary(card, item.episode);
    els.longEpisodeList.appendChild(card);
  }

  function appendLongEpisodeParsedSummary(card, episodeNumber) {
    var script = findLongEpisode(episodeNumber);
    if (!script) {
      return;
    }
    var summary = document.createElement("div");
    summary.className = "parse-summary";
    var panels = script.panels || [];
    var title = document.createElement("div");
    title.className = "status-pill";
    title.textContent = "已解析：第 " + script.episode + " 话，" + panels.length + " 格";
    summary.appendChild(title);
    panels.forEach(function (panel) {
      var line = document.createElement("div");
      line.className = "parse-line";
      line.textContent = "第 " + panel.index + " 格：" + compactText(panel.content, 120);
      summary.appendChild(line);
    });
    card.appendChild(summary);
  }

  function appendField(parent, labelText, control) {
    var label = document.createElement("label");
    label.textContent = labelText;
    label.appendChild(control);
    parent.appendChild(label);
  }

  function renderLongImages() {
    renderImageTabs(els.longImageTabs, imageTabItems());
    renderLongImagePrompts();
    renderLongImageResults();
  }

  function renderLongImagePrompts() {
    els.longImagePromptList.innerHTML = "";
    if (state.project.imagePrompts.length === 0) {
      var empty = document.createElement("span");
      empty.className = "status-pill";
      empty.textContent = "暂无图片 Prompt";
      els.longImagePromptList.appendChild(empty);
      return;
    }
    ensureActiveImageIndex();
    var item = activeImagePrompt();
    if (item) {
      appendImagePromptCard(els.longImagePromptList, item);
    }
  }

  function renderLongImageResults() {
    els.longImageList.innerHTML = "";
    ensureActiveImageIndex();
    var image = activeImageResult();
    if (image) {
      appendImageResultCard(els.longImageList, image);
    }
  }

  function renderLongEpisodeTabs() {
    els.longEpisodeTabs.innerHTML = "";
    if (state.project.longEpisodePrompts.length === 0) {
      return;
    }
    ensureActiveLongEpisode();
    state.project.longEpisodePrompts.forEach(function (item) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.textContent = "第 " + item.episode + " 话" + (findLongEpisode(item.episode) ? " ✓" : "");
      tab.className = item.episode === state.longMangaUI.activeEpisode ? "active" : "";
      tab.addEventListener("click", function () {
        setActiveLongEpisode(item.episode);
      });
      els.longEpisodeTabs.appendChild(tab);
    });
  }

  function activeLongEpisodePrompt() {
    ensureActiveLongEpisode();
    return state.project.longEpisodePrompts.find(function (item) {
      return item.episode === state.longMangaUI.activeEpisode;
    });
  }

  function ensureActiveLongEpisode() {
    var prompts = state.project.longEpisodePrompts;
    if (prompts.length === 0) {
      state.longMangaUI.activeEpisode = null;
      return;
    }
    var exists = prompts.some(function (item) {
      return item.episode === state.longMangaUI.activeEpisode;
    });
    if (!exists) {
      state.longMangaUI.activeEpisode = prompts[0].episode;
    }
  }

  function findLongEpisode(episodeNumber) {
    return (state.project.longEpisodes || []).find(function (episode) {
      return episode.episode === episodeNumber;
    });
  }

  function syncLongMangaImagePrompts() {
    applyLongEpisodesToPanels();
    renderPanels();
    buildImagePrompts();
    state.longMangaUI.step = "episodes";
  }

  function imageTabItems() {
    return state.project.imagePrompts.length > 0 ? state.project.imagePrompts : state.project.images;
  }

  function renderImageTabs(target, items) {
    target.innerHTML = "";
    if (items.length === 0) {
      return;
    }
    ensureActiveImageIndex();
    items.forEach(function (item) {
      var tab = document.createElement("button");
      tab.type = "button";
      tab.textContent = imageTabLabel(item.index);
      tab.className = item.index === state.imageUI.activeIndex ? "active" : "";
      tab.addEventListener("click", function () {
        setActiveImageIndex(item.index);
      });
      target.appendChild(tab);
    });
  }

  function imageTabLabel(index) {
    var image = findImageResult(index);
    if (image && image.status === "downloaded") {
      return "图片 " + index + " ✓";
    }
    if (image && image.status === "failed") {
      return "图片 " + index + " !";
    }
    return "图片 " + index;
  }

  function setActiveImageIndex(index) {
    state.imageUI.activeIndex = index;
    renderImagePrompts();
    renderImages();
    renderLongImages();
  }

  function ensureActiveImageIndex() {
    var items = imageTabItems();
    if (items.length === 0) {
      state.imageUI.activeIndex = null;
      return;
    }
    var exists = items.some(function (item) {
      return item.index === state.imageUI.activeIndex;
    });
    if (!exists) {
      state.imageUI.activeIndex = items[0].index;
    }
  }

  function activeImagePrompt() {
    ensureActiveImageIndex();
    return state.project.imagePrompts.find(function (item) {
      return item.index === state.imageUI.activeIndex;
    });
  }

  function activeImageResult() {
    ensureActiveImageIndex();
    var image = findImageResult(state.imageUI.activeIndex);
    if (image) {
      return image;
    }
    if (state.imageUI.activeIndex === null) {
      return null;
    }
    return { index: state.imageUI.activeIndex, status: "pending", dataUrl: "", error: "" };
  }

  function findImageResult(index) {
    return state.project.images.find(function (image) {
      return image.index === index;
    });
  }

  function appendImagePromptCard(parent, item) {
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
    textarea.placeholder = "先完成分镜解析，再点击“生成图片 Prompt”得到用于图片模型的提示词。";
    textarea.spellcheck = false;
    textarea.addEventListener("input", function () {
      item.prompt = textarea.value;
      state.project.updatedAt = new Date().toISOString();
      autoSaveProject();
    });
    card.appendChild(head);
    card.appendChild(textarea);
    parent.appendChild(card);
  }

  function appendImageResultCard(parent, image) {
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
    parent.appendChild(card);
  }

  function renderImagePrompts() {
    renderImageTabs(els.imagePromptTabs, imageTabItems());
    els.imagePromptList.innerHTML = "";
    if (state.project.imagePrompts.length === 0) {
      return;
    }
    ensureActiveImageIndex();
    var item = activeImagePrompt();
    if (item) {
      appendImagePromptCard(els.imagePromptList, item);
    }
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
    setBusy(els.callLongImageBtn, true);
    var allDone = true;
    try {
      for (var i = 0; i < state.project.imagePrompts.length; i++) {
        var item = state.project.imagePrompts[i];
        state.imageUI.activeIndex = item.index;
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
        renderImagePrompts();
        renderImages();
        renderLongImages();
        autoSaveProject();
      }
      state.project.status = state.project.images.every(function (image) {
        return image.status === "downloaded";
      }) ? "images_done" : "image_partial";
      renderProjectStatus();
      if ((state.project.storyMode || "standard") === "long") {
        state.longMangaUI.step = "images";
        renderLongManga();
        setActiveTab("longManga");
      } else {
        setActiveTab("storyPrompt");
        setStandardStep("images");
      }
      return allDone;
    } finally {
      setBusy(els.callImageBtn, false);
      setBusy(els.callLongImageBtn, false);
    }
  }

  async function runFullAuto() {
    setBusy(els.fullAutoBtn, true);
    try {
      log("Full auto flow started.");
      if (state.project.storyMode === "long") {
        await runLongMangaAuto();
        return;
      }
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

  async function runLongMangaAuto() {
    if (!buildLongOutlinePrompt()) {
      return;
    }
    var outlineOK = await callLongOutline();
    if (!outlineOK) {
      log("Full auto stopped at long manga outline step.");
      return;
    }
    if (!buildLongEpisodePrompts()) {
      return;
    }
    var episodesOK = await callLongEpisodes();
    if (!episodesOK) {
      log("Full auto stopped with long manga episode errors.");
      return;
    }
    buildImagePrompts();
    if (state.project.imagePrompts.length === 0) {
      log("Full auto stopped before image generation.");
      return;
    }
    var imageOK = await callImageAPI();
    log(imageOK ? "Full auto long manga flow completed." : "Full auto long manga flow completed with image errors.");
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
    ensureActiveImageIndex();
    var image = activeImageResult();
    if (image) {
      appendImageResultCard(els.imageList, image);
    }
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
        state.projectSaved = true;
        applyProjectToForm();
        renderAll();
        autoSaveProject();
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

  function parseJSONBlock(text) {
    var blocks = extractCodeBlocksWithLanguage(text, "json");
    var payload = blocks.length > 0 ? blocks[0] : text;
    return JSON.parse(payload.trim());
  }

  function normalizeLongOutline(outline) {
    if (!outline || !Array.isArray(outline.episodes) || outline.episodes.length === 0) {
      throw new Error("Long manga outline contains no episodes.");
    }
    outline.total_episodes = outline.total_episodes || outline.episodes.length;
    outline.episodes = outline.episodes.map(function (episode, index) {
      return {
        episode: episode.episode || index + 1,
        title: episode.title || "",
        summary: episode.summary || "",
        character_ids: episode.character_ids || []
      };
    });
    return outline;
  }

  function normalizeLongEpisode(script, outline) {
    if (!script || !Array.isArray(script.panels) || script.panels.length === 0) {
      throw new Error("Long manga episode contains no panels.");
    }
    script.episode = script.episode || outline.episode;
    script.title = script.title || outline.title;
    script.summary = script.summary || outline.summary;
    script.character_ids = script.character_ids || outline.character_ids || [];
    script.panels = script.panels.map(function (panel, index) {
      return {
        index: panel.index || index + 1,
        character_ids: panel.character_ids || script.character_ids,
        content: panel.content || ""
      };
    });
    script.costume_states = script.costume_states || [];
    return script;
  }

  function resolveCharacters(ids) {
    if (!ids || ids.length === 0) {
      return selectedCharacters();
    }
    return ids.map(getCharacter).filter(Boolean);
  }

  function costumeStatesForEpisode(ids) {
    var allowed = new Set(ids || []);
    return (state.project.characterCostumes || []).filter(function (costume) {
      return allowed.has(costume.character_id);
    });
  }

  function findLongOutlineEpisode(episodeNumber) {
    var outline = state.project.longOutline;
    if (!outline || !outline.episodes) {
      return null;
    }
    return outline.episodes.find(function (episode) {
      return episode.episode === episodeNumber;
    });
  }

  function upsertLongEpisode(script) {
    var episodes = state.project.longEpisodes || [];
    var found = false;
    state.project.longEpisodes = episodes.map(function (episode) {
      if (episode.episode === script.episode) {
        found = true;
        return script;
      }
      return episode;
    });
    if (!found) {
      state.project.longEpisodes.push(script);
    }
    state.project.longEpisodes.sort(function (a, b) {
      return a.episode - b.episode;
    });
  }

  function mergeCostumeStates(updates) {
    var byID = {};
    (state.project.characterCostumes || []).forEach(function (costume) {
      byID[costume.character_id] = costume;
    });
    updates.forEach(function (costume) {
      if (costume.character_id && costume.outfit) {
        byID[costume.character_id] = costume;
      }
    });
    state.project.characterCostumes = Object.keys(byID).sort().map(function (id) {
      return byID[id];
    });
  }

  function applyLongEpisodesToPanels() {
    state.project.panels = (state.project.longEpisodes || []).map(function (episode, index) {
      return {
        index: index + 1,
        content: longMangaEpisodeContent(episode),
        characterIds: episode.character_ids || []
      };
    });
    if (state.project.panels.length > 0) {
      state.project.status = "storyboard_done";
    }
  }

  function longMangaEpisodeContent(episode) {
    var lines = ["#### 【第 " + episode.episode + " 话】", ""];
    if (episode.summary) {
      lines.push("**梗概**：" + episode.summary, "");
    }
    (episode.panels || []).forEach(function (panel, index) {
      if (index > 0) {
        lines.push("");
      }
      lines.push(panel.content);
    });
    return lines.join("\n");
  }

  function getLongEpisodeRaw(episodeNumber) {
    var item = (state.project.longEpisodeRaws || []).find(function (raw) {
      return raw.episode === episodeNumber;
    });
    return item ? item.raw : "";
  }

  function setLongEpisodeRaw(episodeNumber, raw, shouldAutoSave) {
    if (!state.project.longEpisodeRaws) {
      state.project.longEpisodeRaws = [];
    }
    var item = state.project.longEpisodeRaws.find(function (entry) {
      return entry.episode === episodeNumber;
    });
    if (item) {
      item.raw = raw;
    } else {
      state.project.longEpisodeRaws.push({ episode: episodeNumber, raw: raw });
    }
    state.project.updatedAt = new Date().toISOString();
    if (shouldAutoSave) {
      autoSaveProject();
    }
  }

  function appendLongOutlineDelta(delta) {
    state.project.rawLongOutline += delta;
    els.rawLongOutline.value = state.project.rawLongOutline;
    els.rawLongOutline.scrollTop = els.rawLongOutline.scrollHeight;
  }

  function resetLongOutlineOutput() {
    state.project.rawLongOutline = "";
    els.rawLongOutline.value = "";
  }

  function appendLongEpisodeDelta(episodeNumber) {
    return function (delta) {
      setLongEpisodeRaw(episodeNumber, getLongEpisodeRaw(episodeNumber) + delta);
      renderLongEpisodeList();
    };
  }

  function resetLongEpisodeOutput(episodeNumber) {
    return function () {
      setLongEpisodeRaw(episodeNumber, "");
      renderLongEpisodeList();
    };
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
    return renderTemplateBlocks(template, context);
  }

  function renderTemplateBlocks(template, context) {
    var rendered = template.replace(/\{\{\-?\s*range\s+([^{}]+?)\s*\}\}([\s\S]*?)\{\{\-?\s*end\s*\}\}/g, function (_, expression, block) {
      var values = valueForExpression(expression.trim(), context);
      if (!Array.isArray(values)) {
        return "";
      }
      return values.map(function (item) {
        return renderTemplateBlocks(block, Object.assign({}, context, { ".": item }));
      }).join("");
    });
    rendered = rendered.replace(/\{\{\-?\s*if\s+([^{}]+?)\s*\}\}([\s\S]*?)(?:\{\{\-?\s*else\s*\}\}([\s\S]*?))?\{\{\-?\s*end\s*\}\}/g, function (_, expression, truthyBlock, falsyBlock) {
      var value = valueForExpression(expression.trim(), context);
      var block = isTruthy(value) ? truthyBlock : (falsyBlock || "");
      return renderTemplateBlocks(block, context);
    });
    return renderVariables(rendered, context);
  }

  function renderVariables(template, context) {
    return template.replace(/\{\{\-?\s*([^{}]+?)\s*\-?\}\}/g, function (_, expression) {
      return valueForExpression(expression.trim(), context);
    });
  }

  function valueForExpression(expression, context) {
    if (expression.indexOf("join ") === 0) {
      return valueForJoinExpression(expression, context);
    }
    if (expression.charAt(0) === '"' && expression.charAt(expression.length - 1) === '"') {
      return expression.slice(1, -1);
    }
    if (expression.indexOf(".") !== 0) {
      return "";
    }
    var path = expression.slice(1).split(".");
    var value = context;
    if (context["."] && path[0] && hasTemplateKey(context["."], path[0])) {
      value = context["."];
    }
    for (var i = 0; i < path.length; i++) {
      if (!path[i]) {
        continue;
      }
      value = getTemplateValue(value, path[i]);
    }
    return value == null ? "" : value;
  }

  function valueForJoinExpression(expression, context) {
    var match = expression.match(/^join\s+(\.[^\s]+)\s+"([^"]*)"$/);
    if (!match) {
      return "";
    }
    var values = valueForExpression(match[1], context);
    if (!Array.isArray(values)) {
      return "";
    }
    return values.join(match[2]);
  }

  function getTemplateValue(value, key) {
    if (!value) {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
    var jsKey = toJSKey(key);
    if (Object.prototype.hasOwnProperty.call(value, jsKey)) {
      return value[jsKey];
    }
    return "";
  }

  function hasTemplateKey(value, key) {
    if (!value) {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(value, key) || Object.prototype.hasOwnProperty.call(value, toJSKey(key));
  }

  function isTruthy(value) {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return Boolean(value);
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

  function extractCodeBlocksWithLanguage(markdown, language) {
    var blocks = [];
    var re = /```([^\n]*)\n([\s\S]*?)```/g;
    var match;
    while ((match = re.exec(markdown)) !== null) {
      if (match[1].trim() === language) {
        blocks.push(match[2].replace(/\n$/, ""));
      }
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
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === id);
    });
  }

  function setBusy(button, busy) {
    button.disabled = busy;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        log("Copied to clipboard.");
      }).catch(function () {
        copyTextWithFallback(text);
      });
      return;
    }
    copyTextWithFallback(text);
  }

  function copyTextWithFallback(text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (document.execCommand("copy")) {
        log("Copied to clipboard.");
      } else {
        log("Clipboard copy failed.");
      }
    } catch (err) {
      logError("Clipboard copy failed", err);
    } finally {
      textarea.remove();
    }
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

  function compactText(value, limit) {
    var text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > limit ? text.slice(0, limit - 1) + "..." : text;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }
})();
