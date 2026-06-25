(function () {
  "use strict";

  var data = window.LLE_DATA;
  var settingsKey = "lovelive-engine-web-settings";
  var projectKey = "lovelive-engine-web-project";
  var historyKey = "lovelive-engine-web-history";
  var characterSettingsKey = "lovelive-engine-web-characters";
  var state = {
    settings: defaultSettings(),
    project: defaultProject(),
    characterSettings: [],
    editingCharacterID: null,
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
    log("Ready. Static app loaded with " + effectiveCharacters().length + " characters and " + data.styles.length + " styles.");
  });

  function bindElements() {
    [
      "fullAutoBtn", "saveProjectBtn", "newProjectBtn", "settingsPanel", "settingsToggleBtn", "settingsBody", "saveSettingsBtn", "clearHistoryBtn",
      "llmProvider", "llmEndpoint", "llmApiKey", "llmModel",
      "imageProvider", "imageEndpoint", "imageApiKey", "imageModel", "geminiImageSize", "geminiImageSizeWrap",
      "historyList", "projectStatus", "seriesFilter", "characterSearch", "characterListSummary", "styleSelect", "storyMode", "languageInput", "storyLengthWrap", "storyLengthEnabledInput", "storyLengthInput",
      "addCharacterBtn", "importCharactersBtn", "exportCharactersBtn", "characterFileInput",
      "standardStepPromptTab", "standardStepImagesTab",
      "standardStepPromptPanel", "standardStepImagesPanel",
      "characterList", "selectedCharacters", "plotHint", "buildStoryboardPromptBtn", "callLLMBtn",
      "storyboardPrompt", "copyStoryboardPromptBtn", "rawStoryboard", "parseStoryboardBtn", "buildImagePromptsBtn",
      "longStepOutlineTab", "longStepEpisodesTab", "longStepImagesTab",
      "longStepOutlinePanel", "longStepEpisodesPanel", "longStepImagesPanel",
	  "multiRoundTitle", "multiRoundOutlineTitle", "multiRoundOutlinePromptLabel", "multiRoundOutlineResultLabel", "multiRoundStoryboardTitle",
      "buildLongOutlinePromptBtn", "callLongOutlineBtn", "selectAllFourPanelStoriesBtn", "parseLongOutlineBtn", "nextLongOutlineBtn",
      "buildLongEpisodePromptsBtn", "callLongEpisodesBtn", "nextLongEpisodesBtn",
      "longOutlinePrompt", "copyLongOutlinePromptBtn", "rawLongOutline", "longOutlineSummary", "longBatchStoryboardWrap", "longBatchStoryboardEnabledInput",
      "longBatchStoryboardPanel", "longBatchStoryboardPrompt", "copyLongBatchStoryboardPromptBtn", "rawLongBatchStoryboard", "parseLongBatchStoryboardBtn",
      "longEpisodeOutlineSummary", "longEpisodeTabs", "longEpisodeList",
      "buildLongImagePromptsBtn", "callLongImageBtn", "longImageOutlineSummary", "longImageTabs", "longImagePromptList", "longImageList",
      "panelList", "imagePromptTabs", "imagePromptList", "callImageBtn", "imageList", "downloadProjectBtn",
      "clearLogBtn", "logOutput", "overwritePromptDialog", "overwritePromptMessage", "fourPanelSelectionDialog", "longEpisodeSequenceDialog", "longEpisodeSequenceMessage",
      "characterDialog", "characterForm", "characterDialogTitle", "closeCharacterDialogBtn", "cancelCharacterBtn", "characterFormError",
      "characterSeriesInput", "characterIDInput", "characterNameInput", "characterNameEnInput",
      "characterHairStyleInput", "characterHairColorInput", "characterEyeShapeInput", "characterEyeColorInput",
      "characterHeightInput", "characterBodyTypeInput", "characterOtherInput", "characterPersonalityInput", "characterTagsInput"
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
    els.addCharacterBtn.addEventListener("click", openNewCharacterDialog);
    els.importCharactersBtn.addEventListener("click", function () {
      els.characterFileInput.click();
    });
    els.exportCharactersBtn.addEventListener("click", exportCharacterSettings);
    els.characterFileInput.addEventListener("change", importCharacterSettings);
    els.characterForm.addEventListener("submit", saveCharacterFromForm);
    els.closeCharacterDialogBtn.addEventListener("click", closeCharacterDialog);
    els.cancelCharacterBtn.addEventListener("click", closeCharacterDialog);
    els.styleSelect.addEventListener("change", syncProjectFromForm);
    els.storyMode.addEventListener("change", function () {
      syncProjectFromForm();
      updateRouteUI();
      setActiveTab(firstTabForMode(state.project.storyMode));
    });
    els.languageInput.addEventListener("input", syncProjectFromForm);
    els.storyLengthEnabledInput.addEventListener("change", function () {
      els.storyLengthInput.disabled = !els.storyLengthEnabledInput.checked;
      syncProjectFromForm();
    });
    els.storyLengthInput.addEventListener("input", syncProjectFromForm);
    els.plotHint.addEventListener("input", syncProjectFromForm);
    els.buildStoryboardPromptBtn.addEventListener("click", buildStoryboardPrompt);
    els.copyStoryboardPromptBtn.addEventListener("click", function () {
      copyText(state.project.storyboardPrompt || els.storyboardPrompt.value || "");
    });
    els.callLLMBtn.addEventListener("click", callLLM);
    els.standardStepPromptTab.addEventListener("click", function () {
      setStandardStep("prompt");
    });
    els.standardStepImagesTab.addEventListener("click", function () {
      setStandardStep("images");
    });
    els.rawStoryboard.addEventListener("input", updateRawStoryboardFromInput);
    els.parseStoryboardBtn.addEventListener("click", function () {
      parseStoryboardFromRaw();
    });
    els.buildImagePromptsBtn.addEventListener("click", buildImagePrompts);
    els.buildLongOutlinePromptBtn.addEventListener("click", buildLongOutlinePrompt);
    els.copyLongOutlinePromptBtn.addEventListener("click", function () {
      copyText(state.project.longOutlinePrompt || els.longOutlinePrompt.value || "");
    });
    els.callLongOutlineBtn.addEventListener("click", callLongOutline);
    els.rawLongOutline.addEventListener("input", updateRawLongOutlineFromInput);
    els.selectAllFourPanelStoriesBtn.addEventListener("click", selectAllFourPanelStories);
    els.parseLongOutlineBtn.addEventListener("click", parseLongOutlineFromRaw);
    els.nextLongOutlineBtn.addEventListener("click", goToLongEpisodesStep);
    els.longBatchStoryboardEnabledInput.addEventListener("change", function () {
      syncProjectFromForm();
      renderLongManga();
    });
    els.buildLongEpisodePromptsBtn.addEventListener("click", buildLongEpisodePrompts);
    els.callLongEpisodesBtn.addEventListener("click", callLongEpisodes);
    els.nextLongEpisodesBtn.addEventListener("click", goToLongImagesStep);
    els.copyLongBatchStoryboardPromptBtn.addEventListener("click", function () {
      copyText(state.project.longBatchStoryboardPrompt || els.longBatchStoryboardPrompt.value || "");
    });
    els.rawLongBatchStoryboard.addEventListener("input", updateRawLongBatchStoryboardFromInput);
    els.parseLongBatchStoryboardBtn.addEventListener("click", parseLongBatchStoryboardFromRaw);
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
      storyLengthEnabled: false,
      storyLength: 0,
      style: "watercolor",
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
	  selectedFourPanelStories: [],
      longBatchStoryboardEnabled: false,
      longBatchStoryboardPrompt: "",
      rawLongBatchStoryboard: "",
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
    state.characterSettings = loadCharacterSettings(readJSON(characterSettingsKey, []));
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

    fillSeriesFilter();
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
    els.storyLengthEnabledInput.checked = !!state.project.storyLengthEnabled;
    els.storyLengthInput.disabled = !els.storyLengthEnabledInput.checked;
    els.storyLengthInput.value = state.project.storyLength || 4;
    els.plotHint.value = state.project.plotHint;
    setGeneratedPromptValue(els.storyboardPrompt, state.project.storyboardPrompt);
    els.rawStoryboard.value = state.project.rawStoryboard;
    setGeneratedPromptValue(els.longOutlinePrompt, state.project.longOutlinePrompt || "");
    els.rawLongOutline.value = state.project.rawLongOutline || "";
    els.longBatchStoryboardEnabledInput.checked = !!state.project.longBatchStoryboardEnabled;
    setGeneratedPromptValue(els.longBatchStoryboardPrompt, state.project.longBatchStoryboardPrompt || "");
    els.rawLongBatchStoryboard.value = state.project.rawLongBatchStoryboard || "";
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

  function fillSeriesFilter() {
    var selected = els.seriesFilter.value;
    var seriesIDs = effectiveCharacters().map(function (character) {
      return character.series;
    }).filter(function (seriesID, index, values) {
      return values.indexOf(seriesID) === index;
    }).sort();
    var options = seriesIDs.map(function (seriesID) {
      var series = data.series.find(function (item) {
        return item.id === seriesID;
      });
      return {
        value: seriesID,
        label: series ? series.name + " (" + seriesID + ")" : seriesID
      };
    });
    fillSelect(els.seriesFilter, [{ value: "", label: "全部作品" }].concat(options));
    els.seriesFilter.value = seriesIDs.indexOf(selected) === -1 ? "" : selected;
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
    state.project.storyLengthEnabled = els.storyLengthEnabledInput.checked;
    state.project.storyLength = state.project.storyLengthEnabled ? Number.parseInt(els.storyLengthInput.value, 10) || 0 : 0;
    state.project.plotHint = els.plotHint.value.trim();
    state.project.storyboardPrompt = els.storyboardPrompt.value;
    state.project.rawStoryboard = els.rawStoryboard.value;
    state.project.longOutlinePrompt = els.longOutlinePrompt.value;
    state.project.rawLongOutline = els.rawLongOutline.value;
    state.project.longBatchStoryboardEnabled = state.project.storyMode === "long" && els.longBatchStoryboardEnabledInput.checked;
    state.project.longBatchStoryboardPrompt = els.longBatchStoryboardPrompt.value;
    state.project.rawLongBatchStoryboard = els.rawLongBatchStoryboard.value;
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

  function updateRawLongBatchStoryboardFromInput() {
    state.project.rawLongBatchStoryboard = els.rawLongBatchStoryboard.value;
    state.project.updatedAt = new Date().toISOString();
    autoSaveProject();
  }

  function saveProject() {
    saveCurrentProject();
    log("Project prompts saved locally: " + state.project.id);
  }

  function saveCurrentProject() {
    syncProjectFromForm();
    state.projectSaved = true;
    persistProject();
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

  async function goToLongEpisodesStep() {
    if (!state.project.longOutline && !parseLongOutlineFromRaw()) {
      return false;
    }
    if (state.project.storyMode === "four" && (state.project.selectedFourPanelStories || []).length === 0) {
      showFourPanelSelectionDialog();
      return false;
    }
    if (state.project.longEpisodePrompts.length === 0 && !await buildLongEpisodePrompts()) {
      return false;
    }
    setLongMangaStep("episodes");
    log("Moved to long manga episode prompts.");
    return true;
  }

  async function goToLongImagesStep() {
    if (state.project.storyMode === "long" && state.project.longBatchStoryboardEnabled && state.project.longEpisodes.length === 0) {
      if (!await parseLongBatchStoryboardFromRaw()) {
        return false;
      }
    }
    if (state.project.storyMode === "four") {
      if (!await ensureLongEpisodesParsed()) {
        return false;
      }
      applyLongEpisodesToPanels();
      renderPanels();
      await buildLongImagePromptsStep();
    }
    setLongMangaStep("images");
    log("Moved to long manga image prompts.");
    return true;
  }

  async function ensureLongEpisodesParsed() {
    if (state.project.longEpisodePrompts.length === 0 && !await buildLongEpisodePrompts()) {
      return false;
    }
    var allDone = true;
    for (var i = 0; i < state.project.longEpisodePrompts.length; i++) {
      var item = state.project.longEpisodePrompts[i];
      var exists = (state.project.longEpisodes || []).some(function (episode) {
        return episode.episode === item.episode;
      });
      if (!exists) {
        state.longMangaUI.activeEpisode = item.episode;
        if (!await parseLongEpisodeFromRaw(item.episode)) {
          allDone = false;
        }
      }
    }
    return allDone;
  }

  function renderProjectStatus() {
    els.projectStatus.textContent = state.project.status || "draft";
  }

  function updateRouteUI() {
    var mode = state.project.storyMode || "standard";
	els.storyLengthWrap.classList.toggle("is-hidden", mode !== "long");
    document.querySelectorAll("[data-route]").forEach(function (element) {
	  element.hidden = element.dataset.route.split(" ").indexOf(mode) === -1;
    });
    setActiveTab(firstTabForMode(mode));
	if (mode === "four") {
	  els.fullAutoBtn.textContent = "执行四格漫画流程";
	} else {
	  els.fullAutoBtn.textContent = mode === "long" ? "全自动执行长漫画" : "全自动执行标准漫画";
	}
  }

  function firstTabForMode(mode) {
	return mode === "long" || mode === "four" ? "longManga" : "storyPrompt";
  }

  function renderCharacters() {
    var series = els.seriesFilter.value;
    var query = els.characterSearch.value.trim().toLowerCase();
    var selected = new Set(state.project.characterIds);
    var list = effectiveCharacters().filter(function (character) {
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
    });

    els.characterList.innerHTML = "";
    els.characterListSummary.textContent = "共 " + list.length + " 个";
    if (list.length === 0) {
      var empty = document.createElement("p");
      empty.className = "character-list-empty";
      empty.textContent = "没有找到匹配的角色，请调整作品或搜索条件。";
      els.characterList.appendChild(empty);
      return;
    }
    list.forEach(function (character) {
      var fullID = character.series + "/" + character.id;
      var entry = document.createElement("span");
      entry.className = "character-entry";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "character-chip" + (selected.has(fullID) ? " selected" : "");
      button.textContent = character.name + " / " + character.id;
      button.title = fullID;
      button.addEventListener("click", function () {
        toggleCharacter(fullID);
      });
      var editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "character-edit-btn";
      editButton.textContent = "编辑";
      editButton.title = "编辑 " + character.name;
      editButton.setAttribute("aria-label", "编辑 " + character.name + " 的角色设定");
      editButton.addEventListener("click", function () {
        openEditCharacterDialog(fullID);
      });
      entry.appendChild(button);
      entry.appendChild(editButton);
      els.characterList.appendChild(entry);
    });
  }

  function openNewCharacterDialog() {
    state.editingCharacterID = null;
    els.characterForm.reset();
    els.characterDialogTitle.textContent = "添加角色";
    els.characterSeriesInput.disabled = false;
    els.characterIDInput.disabled = false;
    els.characterFormError.textContent = "";
    els.characterDialog.showModal();
  }

  function openEditCharacterDialog(fullID) {
    var character = getCharacter(fullID);
    if (!character) {
      return;
    }
    state.editingCharacterID = fullID;
    els.characterDialogTitle.textContent = "编辑角色设定";
    els.characterSeriesInput.value = character.series;
    els.characterIDInput.value = character.id;
    els.characterNameInput.value = character.name;
    els.characterNameEnInput.value = character.name_en || "";
    els.characterHairStyleInput.value = character.appearance.hair_style;
    els.characterHairColorInput.value = character.appearance.hair_color;
    els.characterEyeShapeInput.value = character.appearance.eye_shape;
    els.characterEyeColorInput.value = character.appearance.eye_color;
    els.characterHeightInput.value = character.appearance.height;
    els.characterBodyTypeInput.value = character.appearance.body_type;
    els.characterOtherInput.value = character.appearance.other;
    els.characterPersonalityInput.value = character.personality;
    els.characterTagsInput.value = (character.tags || []).join(", ");
    els.characterSeriesInput.disabled = true;
    els.characterIDInput.disabled = true;
    els.characterFormError.textContent = "";
    els.characterDialog.showModal();
  }

  function closeCharacterDialog() {
    els.characterDialog.close();
  }

  function saveCharacterFromForm(event) {
    event.preventDefault();
    var character = characterFromForm();
    var fullID = character.series + "/" + character.id;
    if (!state.editingCharacterID && getCharacter(fullID)) {
      els.characterFormError.textContent = "该作品 ID 和角色 ID 已存在，请使用其他 ID。";
      return;
    }
    if (!isValidCharacterID(character.series) || !isValidCharacterID(character.id)) {
      els.characterFormError.textContent = "作品 ID 和角色 ID 只能包含小写字母、数字和连字符。";
      return;
    }
    storeCharacterSetting(character);
    closeCharacterDialog();
    fillSeriesFilter();
    renderCharacters();
    renderSelectedCharacters();
    log("Character setting saved locally: " + fullID);
  }

  function characterFromForm() {
    return {
      id: els.characterIDInput.value.trim(),
      name: els.characterNameInput.value.trim(),
      name_en: els.characterNameEnInput.value.trim(),
      series: els.characterSeriesInput.value.trim(),
      appearance: {
        hair_style: els.characterHairStyleInput.value.trim(),
        hair_color: els.characterHairColorInput.value.trim(),
        eye_shape: els.characterEyeShapeInput.value.trim(),
        eye_color: els.characterEyeColorInput.value.trim(),
        height: els.characterHeightInput.value.trim(),
        body_type: els.characterBodyTypeInput.value.trim(),
        other: els.characterOtherInput.value.trim()
      },
      personality: els.characterPersonalityInput.value.trim(),
      tags: els.characterTagsInput.value.split(",").map(function (tag) {
        return tag.trim();
      }).filter(Boolean)
    };
  }

  function storeCharacterSetting(character) {
    state.characterSettings = upsertCharacterSettings(state.characterSettings, [character]);
    localStorage.setItem(characterSettingsKey, JSON.stringify(state.characterSettings));
  }

  function exportCharacterSettings() {
    var documentData = {
      version: 1,
      characters: state.characterSettings
    };
    downloadJSON(documentData, "lovelive-engine-character-settings.json");
    log("Character settings document exported.");
  }

  async function importCharacterSettings(event) {
    var file = event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      var parsed = JSON.parse(await file.text());
      var characters = Array.isArray(parsed) ? parsed : parsed.characters;
      if (!Array.isArray(characters)) {
        throw new Error("设定文档必须包含 characters 数组。");
      }
      var normalized = characters.map(normalizeCharacterSetting);
      if (normalized.some(function (character) { return !character; })) {
        throw new Error("设定文档包含字段缺失或 ID 格式错误的角色。请检查文档后重试。");
      }
      state.characterSettings = upsertCharacterSettings(state.characterSettings, normalized);
      localStorage.setItem(characterSettingsKey, JSON.stringify(state.characterSettings));
      fillSeriesFilter();
      renderCharacters();
      renderSelectedCharacters();
      log("Imported " + normalized.length + " character settings locally.");
    } catch (err) {
      window.alert("导入角色设定失败：" + (err.message || String(err)));
      logError("Character settings import failed", err);
    }
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

  async function buildStoryboardPrompt() {
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
    var prompt = renderTemplate(data.storybookTemplate, {
      Characters: characters,
      PlotHint: state.project.plotHint,
      Language: normalizeLanguage(state.project.language),
      StyleDescription: style.description
    });
    if (!await confirmContentOverwrite(state.project.storyboardPrompt, "已有分镜 Prompt 会被覆盖。")) {
      return false;
    }
    state.project.storyboardPrompt = prompt;
    state.project.status = "storyboard_prompt_ready";
    setGeneratedPromptValue(els.storyboardPrompt, state.project.storyboardPrompt);
    renderProjectStatus();
    setActiveTab("storyPrompt");
    setStandardStep("prompt");
    log("Storyboard prompt built.");
    return true;
  }

  async function callLLM() {
    saveSettingsFromForm();
    if (!state.project.storyboardPrompt) {
      if (!await buildStoryboardPrompt()) {
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
      if (!await confirmContentOverwrite(state.project.rawStoryboard, "已有 LLM 原始输出会被覆盖。")) {
        return false;
      }
      log("Calling " + state.settings.llmProvider + " LLM in streaming mode: " + state.settings.llmModel);
      state.project.rawStoryboard = "";
      els.rawStoryboard.value = "";
      setActiveTab("storyPrompt");
      setStandardStep("prompt");
      var text = await generateText(state.project.storyboardPrompt, appendStoryboardDelta, resetStoryboardOutput);
      state.project.rawStoryboard = text;
      state.project.status = "storyboard_done";
      els.rawStoryboard.value = text;
      await parseStoryboardFromRaw();
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

  async function parseStoryboardFromRaw(skipImagePrompts) {
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
    if (blocks.length > 0) {
      if (!skipImagePrompts) {
        await buildImagePrompts();
      } else {
        setStandardStep("images");
      }
      saveCurrentProject();
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

  async function buildImagePrompts(options) {
    options = options || {};
    syncProjectFromForm();
    if ((state.project.storyMode || "standard") === "long" && state.project.panels.length === 0) {
      applyLongEpisodesToPanels();
    }
    if (state.project.panels.length === 0) {
      await parseStoryboardFromRaw(true);
    }
    if (state.project.panels.length === 0) {
      log("Storyboard panels are required before building image prompts.");
      return false;
    }
    var template = data.comicTemplates[state.project.style];
    var prompts = state.project.panels.map(function (panel) {
      var characters = charactersForPanel(panel);
      return {
        index: panel.index,
        prompt: renderTemplate(template, {
          Characters: characters,
          CharacterSetting: buildCharacterSetting(characters),
          PanelContent: state.project.storyMode === "four" ? stripFourPanelStoryboardSubtitles(panel.content) : panel.content,
          Language: normalizeLanguage(state.project.language)
        })
      };
    });
    if (options.confirmOverwrite !== false && !await confirmContentOverwrite(promptListContent(state.project.imagePrompts), "已有图片 Prompt 会被覆盖。")) {
      return false;
    }
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
    if (options.navigate === false) {
      log("Built " + prompts.length + " image prompt(s).");
      return true;
    }
    if ((state.project.storyMode || "standard") === "long") {
      state.longMangaUI.step = "images";
      renderLongManga();
      setActiveTab("longManga");
    } else {
      setActiveTab("storyPrompt");
      setStandardStep("images");
    }
    log("Built " + prompts.length + " image prompt(s).");
    return true;
  }

  async function buildLongImagePromptsStep() {
    var built = await buildImagePrompts();
    if (built && state.project.imagePrompts.length > 0) {
      state.longMangaUI.step = "images";
      renderLongManga();
      setActiveTab("longManga");
      return true;
    }
    return false;
  }

  async function buildLongOutlinePrompt() {
    syncProjectFromForm();
    var characters = selectedCharacters();
    if (characters.length === 0) {
      state.project.longOutlinePrompt = "";
      els.longOutlinePrompt.value = "";
	  log("Select at least one character before building the manga outline prompt.");
      return false;
    }
    if (!state.project.plotHint) {
      state.project.longOutlinePrompt = "";
      els.longOutlinePrompt.value = "";
      log("Plot hint is required.");
      return false;
    }

	var fourPanelMode = state.project.storyMode === "four";
    if (!fourPanelMode && state.project.storyLengthEnabled && (!Number.isInteger(state.project.storyLength) || state.project.storyLength < 2)) {
      state.project.longOutlinePrompt = "";
      els.longOutlinePrompt.value = "";
      log("Story length must be an integer greater than or equal to 2.");
      return false;
    }
    var prompt = renderTemplate(fourPanelMode ? data.fourPanelOutlineTemplate : data.longOutlineTemplate, {
      Characters: characters,
      PlotHint: state.project.plotHint,
      Language: normalizeLanguage(state.project.language),
      StoryLength: state.project.storyLengthEnabled ? state.project.storyLength : 0,
      TotalPanels: state.project.storyLengthEnabled ? state.project.storyLength * 4 : 0
    });
	if (!await confirmContentOverwrite(state.project.longOutlinePrompt, "已有漫画梗概 Prompt 会被覆盖。")) {
      return false;
    }
    state.project.longOutlinePrompt = prompt;
    setGeneratedPromptValue(els.longOutlinePrompt, state.project.longOutlinePrompt);
	state.project.status = fourPanelMode ? "four_panel_outline_prompt_ready" : "long_outline_prompt_ready";
    state.longMangaUI.step = "outline";
    renderProjectStatus();
    renderLongManga();
    setActiveTab("longManga");
	log(fourPanelMode ? "Four-panel manga candidate prompt built." : "Long manga outline prompt built.");
    return true;
  }

  async function callLongOutline() {
    saveSettingsFromForm();
    if (!state.project.longOutlinePrompt && !await buildLongOutlinePrompt()) {
      return false;
    }
    if (!state.settings.llmApiKey) {
      log("LLM API key is required in settings.");
      return false;
    }

    setBusy(els.callLongOutlineBtn, true);
    try {
      if (!await confirmContentOverwrite(state.project.rawLongOutline, "已有长漫画梗概结果会被覆盖。")) {
        return false;
      }
      state.project.rawLongOutline = "";
      els.rawLongOutline.value = "";
      setActiveTab("longManga");
      var text = await generateText(state.project.longOutlinePrompt, appendLongOutlineDelta, resetLongOutlineOutput);
      state.project.rawLongOutline = text;
      els.rawLongOutline.value = text;
      parseLongOutlineFromRaw();
      state.longMangaUI.step = "outline";
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
	  state.project.selectedFourPanelStories = [];
	  clearMultiRoundResults();
	  state.project.status = state.project.storyMode === "four" ? "four_panel_outline_done" : "long_outline_done";
      state.longMangaUI.step = "outline";
      renderLongManga();
      renderProjectStatus();
      saveCurrentProject();
	  log("Parsed manga outline with " + outline.episodes.length + " candidate(s).");
      return true;
    } catch (err) {
      logError("Failed to parse long manga outline", err);
      return false;
    }
  }

  async function buildLongEpisodePrompts() {
    syncProjectFromForm();
    if (!state.project.longOutline && !parseLongOutlineFromRaw()) {
      return false;
    }

	var fourPanelMode = state.project.storyMode === "four";
    if (!fourPanelMode && state.project.longBatchStoryboardEnabled) {
      return buildLongBatchStoryboardPrompt();
    }
	var episodes = state.project.longOutline.episodes;
	if (fourPanelMode) {
	  var selected = new Set(state.project.selectedFourPanelStories || []);
	  episodes = episodes.filter(function (episode) {
		return selected.has(episode.episode);
	  });
	  if (episodes.length === 0) {
		log("Select at least one four-panel story candidate before building storyboard prompts.");
		return false;
	  }
      var style = getStyle(state.project.style);
      var prompts = episodes.map(function (episode) {
        return buildLongEpisodePromptItem(episode, fourPanelMode, style);
      });
	  if (!await confirmContentOverwrite(promptListContent(state.project.longEpisodePrompts), "已有分镜 Prompt 会被覆盖。")) {
        return false;
      }
      state.project.longEpisodePrompts = prompts;
	  state.project.status = "four_panel_storyboard_prompts_ready";
      state.longMangaUI.step = "episodes";
      renderLongManga();
      renderProjectStatus();
      setActiveTab("longManga");
	  log("Built " + state.project.longEpisodePrompts.length + " four-panel storyboard prompt(s).");
      return true;
	}

    var prompt = buildNextLongEpisodePrompt({ showBlocked: true, showCompleteLog: true });
    if (!prompt) {
      renderLongManga();
      return false;
    }
	state.project.status = "long_episode_prompts_ready";
    state.longMangaUI.step = "episodes";
    renderLongManga();
    renderProjectStatus();
    setActiveTab("longManga");
    log("Built long manga episode " + prompt.episode + " prompt.");
    return true;
  }

  function buildLongEpisodePromptItem(episode, fourPanelMode, style) {
    var characters = resolveCharacters(episode.character_ids);
    return {
      episode: episode.episode,
	  prompt: renderTemplate(fourPanelMode ? data.fourPanelStoryboardTemplate : data.longEpisodeTemplate, {
        Characters: characters,
        CharacterCostumes: costumeStatesForEpisode(episode.character_ids),
        FullOutline: state.project.longOutline,
        Episode: episode,
        Language: normalizeLanguage(state.project.language),
        StyleDescription: style.description
      })
    };
  }

  function buildNextLongEpisodePrompt(options) {
    options = options || {};
    var episodes = orderedLongOutlineEpisodes();
    var style = getStyle(state.project.style);
    for (var i = 0; i < episodes.length; i++) {
      var episode = episodes[i];
      if (findLongEpisode(episode.episode)) {
        continue;
      }
      if (findLongEpisodePrompt(episode.episode)) {
        state.longMangaUI.activeEpisode = episode.episode;
        if (options.showBlocked) {
          showLongEpisodeSequenceDialog(episode.episode);
        }
        return null;
      }
      if (i > 0 && !findLongEpisode(episodes[i - 1].episode)) {
        state.longMangaUI.activeEpisode = episodes[i - 1].episode;
        if (options.showBlocked) {
          showLongEpisodeSequenceDialog(episodes[i - 1].episode);
        }
        return null;
      }
      var prompt = buildLongEpisodePromptItem(episode, false, style);
      state.project.longEpisodePrompts.push(prompt);
      state.longMangaUI.activeEpisode = prompt.episode;
      return prompt;
    }
    if (options.showCompleteLog) {
      log("All long manga episode prompts are already built.");
    }
    return null;
  }

  function orderedLongOutlineEpisodes() {
    if (!state.project.longOutline || !state.project.longOutline.episodes) {
      return [];
    }
    return state.project.longOutline.episodes.slice().sort(function (a, b) {
      return a.episode - b.episode;
    });
  }

  async function buildLongBatchStoryboardPrompt() {
    if (!state.project.longOutline && !parseLongOutlineFromRaw()) {
      return false;
    }
    var style = getStyle(state.project.style);
    var prompt = renderTemplate(data.longBatchStoryboardTemplate, {
      Characters: selectedCharacters(),
      FullOutline: state.project.longOutline,
      Language: normalizeLanguage(state.project.language),
      StyleDescription: style.description
    });
	if (!await confirmContentOverwrite(state.project.longBatchStoryboardPrompt, "已有批量分镜 Prompt 会被覆盖。")) {
      return false;
    }
    state.project.longBatchStoryboardPrompt = prompt;
    setGeneratedPromptValue(els.longBatchStoryboardPrompt, prompt);
    state.project.status = "long_batch_storyboard_prompt_ready";
    state.longMangaUI.step = "episodes";
    renderLongManga();
    renderProjectStatus();
    setActiveTab("longManga");
    log("Built long manga batch storyboard prompt.");
    return true;
  }

  async function callLongEpisodes() {
    saveSettingsFromForm();
    if (state.project.storyMode === "long" && state.project.longBatchStoryboardEnabled) {
      return callLongBatchStoryboard();
    }
    if (state.project.longEpisodePrompts.length === 0 && !await buildLongEpisodePrompts()) {
      return false;
    }
    if (!state.settings.llmApiKey) {
      log("LLM API key is required in settings.");
      return false;
    }

    setBusy(els.callLongEpisodesBtn, true);
    var allDone = true;
    try {
      if (!await confirmContentOverwrite(rawListContent(state.project.longEpisodeRaws), "已有逐话结果会被覆盖。")) {
        return false;
      }
      for (var i = 0; i < state.project.longEpisodePrompts.length; i++) {
        var item = state.project.longEpisodePrompts[i];
        if (findLongEpisode(item.episode)) {
          continue;
        }
        state.longMangaUI.activeEpisode = item.episode;
        setLongEpisodeRaw(item.episode, "");
        renderLongManga();
        try {
          log("Generating manga storyboard " + item.episode + ".");
          var text = await generateText(item.prompt, appendLongEpisodeDelta(item.episode), resetLongEpisodeOutput(item.episode));
          setLongEpisodeRaw(item.episode, text);
          if (!await parseLongEpisodeFromRaw(item.episode)) {
            allDone = false;
          }
        } catch (err) {
          allDone = false;
		  logError("Manga storyboard " + item.episode + " failed", err);
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

  async function callLongBatchStoryboard() {
    if (!state.project.longBatchStoryboardPrompt && !await buildLongBatchStoryboardPrompt()) {
      return false;
    }
    if (!state.settings.llmApiKey) {
      log("LLM API key is required in settings.");
      return false;
    }

    setBusy(els.callLongEpisodesBtn, true);
    try {
      if (!await confirmContentOverwrite(state.project.rawLongBatchStoryboard, "已有批量分镜结果会被覆盖。")) {
        return false;
      }
      state.project.rawLongBatchStoryboard = "";
      els.rawLongBatchStoryboard.value = "";
      setActiveTab("longManga");
      state.longMangaUI.step = "episodes";
      var text = await generateText(state.project.longBatchStoryboardPrompt, appendLongBatchStoryboardDelta, resetLongBatchStoryboardOutput);
      state.project.rawLongBatchStoryboard = text;
      els.rawLongBatchStoryboard.value = text;
      return parseLongBatchStoryboardFromRaw();
    } catch (err) {
      logError("Long manga batch storyboard request failed", err);
      return false;
    } finally {
      setBusy(els.callLongEpisodesBtn, false);
    }
  }

  async function parseLongEpisodeFromRaw(episodeNumber) {
    var raw = getLongEpisodeRaw(episodeNumber);
    var outline = findLongOutlineEpisode(episodeNumber);
    if (!outline) {
      log("Episode " + episodeNumber + " is not in the current outline.");
      return false;
    }
    try {
      var script = normalizeLongEpisode(parseJSONBlock(raw), outline);
      if (state.project.storyMode === "four" && (script.panels.length !== 4 || script.panels.some(function (panel, index) {
        return panel.index !== index + 1 || hasFourPanelStoryboardSubtitle(panel.content);
      }))) {
        throw new Error("Four-panel storyboard must contain exactly four title-free panels indexed 1, 2, 3, 4.");
      }
      upsertLongEpisode(script);
      mergeCostumeStates(script.costume_states || []);
	  state.project.status = state.project.storyMode === "four" ? "four_panel_storyboard_done" : "long_episode_done";
	  applyLongEpisodesToPanels();
	  renderPanels();
	  await buildImagePrompts({ navigate: false, confirmOverwrite: false });
      if (state.project.storyMode === "long") {
        var nextPrompt = buildNextLongEpisodePrompt();
        if (nextPrompt) {
          log("Built long manga episode " + nextPrompt.episode + " prompt.");
        }
      }
	  state.longMangaUI.step = "episodes";
      renderLongManga();
      saveCurrentProject();
	  log("Parsed manga storyboard " + episodeNumber + ".");
      return true;
    } catch (err) {
      logError("Failed to parse long manga episode " + episodeNumber, err);
      return false;
    }
  }

  async function parseLongBatchStoryboardFromRaw() {
    syncProjectFromForm();
    try {
      var scripts = normalizeLongBatchStoryboard(parseJSONBlock(state.project.rawLongBatchStoryboard));
      state.project.longEpisodes = [];
      state.project.characterCostumes = [];
      scripts.forEach(function (script) {
        upsertLongEpisode(script);
        mergeCostumeStates(script.costume_states || []);
      });
      state.project.status = "long_episode_done";
	  applyLongEpisodesToPanels();
	  renderPanels();
	  await buildImagePrompts({ navigate: false, confirmOverwrite: false });
      state.longMangaUI.step = "episodes";
      renderLongManga();
      saveCurrentProject();
      log("Parsed " + scripts.length + " long manga storyboard episode(s).");
      return true;
    } catch (err) {
      logError("Failed to parse long manga batch storyboard", err);
      return false;
    }
  }

  function renderLongManga() {
	var fourPanelMode = state.project.storyMode === "four";
    var batchMode = state.project.storyMode === "long" && !!state.project.longBatchStoryboardEnabled;
	els.multiRoundTitle.textContent = fourPanelMode ? "四格漫画" : "长漫画";
	els.multiRoundOutlineTitle.textContent = fourPanelMode ? "候选梗概与选择" : "梗概";
	els.multiRoundOutlinePromptLabel.textContent = fourPanelMode ? "四格漫画候选梗概 Prompt" : "长漫画梗概 Prompt";
	els.multiRoundOutlineResultLabel.textContent = fourPanelMode ? "四格漫画候选梗概结果" : "长漫画梗概结果";
	els.multiRoundStoryboardTitle.textContent = fourPanelMode ? "严格四格分镜" : (batchMode ? "批量分镜" : "逐话分镜");
	els.longStepEpisodesTab.textContent = fourPanelMode ? "四格分镜" : "逐话分镜";
    els.buildLongEpisodePromptsBtn.textContent = batchMode ? "生成批量分镜 Prompt" : "生成逐话 Prompt";
    els.callLongEpisodesBtn.textContent = batchMode ? "调用 LLM 批量生成分镜" : "调用 LLM 生成逐话分镜";
    els.longBatchStoryboardWrap.classList.toggle("is-hidden", fourPanelMode);
    els.longBatchStoryboardEnabledInput.checked = batchMode;
    els.longBatchStoryboardPanel.classList.toggle("is-hidden", !batchMode);
    els.selectAllFourPanelStoriesBtn.classList.toggle("is-hidden", !fourPanelMode);
    els.selectAllFourPanelStoriesBtn.disabled = !state.project.longOutline || !state.project.longOutline.episodes || state.project.longOutline.episodes.length === 0;
    setGeneratedPromptValue(els.longOutlinePrompt, state.project.longOutlinePrompt || "");
    els.rawLongOutline.value = state.project.rawLongOutline || "";
    setGeneratedPromptValue(els.longBatchStoryboardPrompt, state.project.longBatchStoryboardPrompt || "");
    els.rawLongBatchStoryboard.value = state.project.rawLongBatchStoryboard || "";
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
	  var fourPanelMode = state.project.storyMode === "four";
	  var content = card;
	  if (fourPanelMode) {
		card.classList.add("four-panel-story-card");
		var select = document.createElement("label");
		select.className = "four-panel-story-selector";
		var checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.setAttribute("aria-label", "选择候选 " + episode.episode + "《" + episode.title + "》");
		checkbox.checked = (state.project.selectedFourPanelStories || []).indexOf(episode.episode) !== -1;
		checkbox.addEventListener("change", function () {
		  setFourPanelStorySelected(episode.episode, checkbox.checked);
		});
		select.appendChild(checkbox);
		card.appendChild(select);
		content = document.createElement("div");
		content.className = "four-panel-story-content";
		card.appendChild(content);
	  }
	  content.innerHTML = '<div class="card-head"><h3>' + (fourPanelMode ? "候选 " : "第 ") + episode.episode + (fourPanelMode ? "《" : " 话《") + escapeHTML(episode.title) + '》</h3><span>' + (episode.character_ids || []).join(", ") + '</span></div>';
      var text = document.createElement("div");
      text.textContent = episode.summary;
	  content.appendChild(text);
      els.longOutlineSummary.appendChild(card);
    });
  }

  function showFourPanelSelectionDialog() {
    if (els.fourPanelSelectionDialog && typeof els.fourPanelSelectionDialog.showModal === "function") {
      els.fourPanelSelectionDialog.showModal();
      return;
    }
    window.alert("请至少选择一个喜欢的独立四格剧情，再进入四格分镜。");
  }

  function showLongEpisodeSequenceDialog(episodeNumber) {
    var message = "请先完成第 " + episodeNumber + " 话解析，再生成下一话 Prompt。";
    if (els.longEpisodeSequenceDialog && typeof els.longEpisodeSequenceDialog.showModal === "function") {
      els.longEpisodeSequenceMessage.textContent = message;
      els.longEpisodeSequenceDialog.showModal();
      return;
    }
    window.alert(message);
  }

  function setFourPanelStorySelected(episodeNumber, selected) {
	var current = state.project.selectedFourPanelStories || [];
	state.project.selectedFourPanelStories = selected
	  ? Array.from(new Set(current.concat(episodeNumber))).sort(function (a, b) { return a - b; })
	  : current.filter(function (number) { return number !== episodeNumber; });
	clearMultiRoundResults();
	autoSaveProject();
	renderLongManga();
  }

  function selectAllFourPanelStories() {
    if (state.project.storyMode !== "four" || !state.project.longOutline || !state.project.longOutline.episodes) {
      return;
    }
    var selected = new Set(state.project.selectedFourPanelStories || []);
    if (state.project.longOutline.episodes.every(function (episode) { return selected.has(episode.episode); })) {
      return;
    }
    state.project.selectedFourPanelStories = state.project.longOutline.episodes.map(function (episode) {
      return episode.episode;
    });
    clearMultiRoundResults();
    autoSaveProject();
    renderLongManga();
  }

  function clearMultiRoundResults() {
	state.project.longBatchStoryboardPrompt = "";
	state.project.rawLongBatchStoryboard = "";
	state.project.longEpisodePrompts = [];
	state.project.longEpisodeRaws = [];
	state.project.longEpisodes = [];
	state.project.panels = [];
	state.project.imagePrompts = [];
	state.project.images = [];
  }

  function renderLongEpisodeList() {
    els.longEpisodeList.innerHTML = "";
    if (state.project.storyMode === "long" && state.project.longBatchStoryboardEnabled) {
      els.longEpisodeTabs.innerHTML = "";
      els.longEpisodeOutlineSummary.classList.add("is-hidden");
      return;
    }
    renderLongEpisodeTabs();
    renderEpisodeOutlineSummary(els.longEpisodeOutlineSummary, state.longMangaUI.activeEpisode);

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
    var parse = document.createElement("button");
    parse.type = "button";
    parse.textContent = "解析本话结果";
    parse.addEventListener("click", function () {
      parseLongEpisodeFromRaw(item.episode);
    });
    var promptArea = document.createElement("textarea");
    promptArea.value = item.prompt;
    promptArea.placeholder = "先解析长漫画梗概，再点击“生成逐话 Prompt”得到本话分镜提示词。";
    promptArea.spellcheck = false;
    promptArea.readOnly = true;
    promptArea.className = "generated-prompt";

    var rawArea = document.createElement("textarea");
    rawArea.value = getLongEpisodeRaw(item.episode);
    rawArea.placeholder = "将本话 Prompt 交给 LLM 后，把返回的分镜结果粘贴到这里，再解析本话内容。";
    rawArea.spellcheck = false;
    rawArea.addEventListener("input", function () {
      setLongEpisodeRaw(item.episode, rawArea.value, true);
    });

    card.appendChild(head);
    appendPromptField(card, "本话 Prompt", promptArea, function () {
      copyText(item.prompt);
    });
    appendField(card, "本话结果", rawArea);
    var actions = document.createElement("div");
    actions.className = "stage-actions result-actions";
    actions.appendChild(parse);
    card.appendChild(actions);
    appendLongEpisodeParsedSummary(card, item.episode);
    els.longEpisodeList.appendChild(card);
    scrollPromptToEnd(promptArea);
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

  function appendPromptField(parent, labelText, control, onCopy) {
    var label = document.createElement("label");
    if (labelText) {
      label.textContent = labelText;
    }
    var field = document.createElement("div");
    field.className = "prompt-field";
    field.appendChild(control);
    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-prompt-btn";
    copy.textContent = "复制 Prompt";
    copy.addEventListener("click", onCopy);
    field.appendChild(copy);
    label.appendChild(field);
    parent.appendChild(label);
  }

  function setGeneratedPromptValue(textarea, value) {
    if (textarea.value === value) {
      return;
    }
    textarea.value = value;
    scrollPromptToEnd(textarea);
  }

  function scrollPromptToEnd(textarea) {
    textarea.scrollTop = textarea.scrollHeight;
    window.requestAnimationFrame(function () {
      textarea.scrollTop = textarea.scrollHeight;
    });
  }

  function renderLongImages() {
    renderImageTabs(els.longImageTabs, imageTabItems());
    renderEpisodeOutlineSummary(els.longImageOutlineSummary, activeImageEpisodeNumber());
    renderLongImagePrompts();
    renderLongImageResults();
  }

  function renderEpisodeOutlineSummary(target, episodeNumber) {
    target.replaceChildren();
    var episode = state.project.storyMode === "long" ? findLongOutlineEpisode(episodeNumber) : null;
    target.classList.toggle("is-hidden", !episode);
    if (!episode) {
      return;
    }
    var head = document.createElement("div");
    head.className = "card-head";
    var title = document.createElement("h3");
    title.textContent = "第 " + episode.episode + " 话《" + episode.title + "》梗概";
    head.appendChild(title);
    var summary = document.createElement("div");
    summary.textContent = episode.summary;
    target.appendChild(head);
    target.appendChild(summary);
  }

  function activeImageEpisodeNumber() {
    ensureActiveImageIndex();
    if (state.imageUI.activeIndex === null) {
      return null;
    }
    var episode = (state.project.longEpisodes || [])[state.imageUI.activeIndex - 1];
    return episode ? episode.episode : state.imageUI.activeIndex;
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
    return findLongEpisodePrompt(state.longMangaUI.activeEpisode);
  }

  function findLongEpisodePrompt(episodeNumber) {
    return (state.project.longEpisodePrompts || []).find(function (item) {
      return item.episode === episodeNumber;
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
    var textarea = document.createElement("textarea");
    textarea.value = item.prompt;
    textarea.placeholder = "先完成分镜解析，再点击“生成图片 Prompt”得到用于图片模型的提示词。";
    textarea.spellcheck = false;
    textarea.readOnly = true;
    textarea.className = "generated-prompt";
    card.appendChild(head);
    appendPromptField(card, "", textarea, function () {
      copyText(item.prompt);
    });
    parent.appendChild(card);
    scrollPromptToEnd(textarea);
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
      await buildImagePrompts();
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
	  if (["long", "four"].indexOf(state.project.storyMode || "standard") !== -1) {
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
	  if (state.project.storyMode === "long" || state.project.storyMode === "four") {
        await runLongMangaAuto();
        return;
      }
      if (!await buildStoryboardPrompt()) {
        return;
      }
      var llmOK = await callLLM();
      if (!llmOK) {
        log("Full auto stopped at LLM step.");
        return;
      }
      await buildImagePrompts();
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
	var fourPanelReady = state.project.storyMode === "four" && state.project.longOutline && (state.project.selectedFourPanelStories || []).length > 0;
	if (!fourPanelReady) {
	  if (!await buildLongOutlinePrompt()) {
		return;
	  }
	  var outlineOK = await callLongOutline();
	  if (!outlineOK) {
		log("Full auto stopped at manga outline step.");
		return;
	  }
	  if (state.project.storyMode === "four") {
		log("Select one or more four-panel story candidates, then continue the flow.");
		return;
	  }
	}
    if (!await buildLongEpisodePrompts()) {
      return;
    }
    var episodesOK = await callLongEpisodes();
    if (!episodesOK) {
      log("Full auto stopped with long manga episode errors.");
      return;
    }
    await buildImagePrompts();
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

  function normalizeLongBatchStoryboard(payload) {
    var scripts = Array.isArray(payload) ? payload : payload && payload.episodes;
    if (!Array.isArray(scripts) || scripts.length === 0) {
      throw new Error("Long manga batch storyboard contains no episodes.");
    }
    if (!state.project.longOutline || !Array.isArray(state.project.longOutline.episodes)) {
      throw new Error("Long manga outline is required before parsing batch storyboard.");
    }
    var byEpisode = {};
    scripts.forEach(function (script) {
      if (!script || !script.episode) {
        throw new Error("Long manga batch storyboard contains episode without number.");
      }
      if (byEpisode[script.episode]) {
        throw new Error("Long manga batch storyboard contains duplicate episode " + script.episode + ".");
      }
      byEpisode[script.episode] = script;
    });
    var normalized = state.project.longOutline.episodes.map(function (outline) {
      var script = byEpisode[outline.episode];
      if (!script) {
        throw new Error("Long manga batch storyboard missing episode " + outline.episode + ".");
      }
      script = normalizeLongEpisode(script, outline);
      validateBatchCostumeStates(script);
      delete byEpisode[outline.episode];
      return script;
    });
    var extraEpisodes = Object.keys(byEpisode);
    if (extraEpisodes.length > 0) {
      throw new Error("Long manga batch storyboard contains extra episode(s): " + extraEpisodes.join(", ") + ".");
    }
    return normalized;
  }

  function validateBatchCostumeStates(script) {
    var seen = {};
    (script.costume_states || []).forEach(function (costume) {
      if (costume.character_id && costume.outfit) {
        seen[costume.character_id] = true;
      }
    });
    (script.character_ids || []).forEach(function (id) {
      if (!seen[id]) {
        throw new Error("Episode " + script.episode + " missing costume state for " + id + ".");
      }
    });
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
    var fourPanelMode = state.project.storyMode === "four";
    state.project.panels = (state.project.longEpisodes || []).map(function (episode, index) {
      return {
        index: index + 1,
        content: longMangaEpisodeContent(episode, fourPanelMode),
        characterIds: episode.character_ids || []
      };
    });
    if (state.project.panels.length > 0) {
      state.project.status = "storyboard_done";
    }
  }

  function longMangaEpisodeContent(episode, fourPanelMode) {
    if (fourPanelMode) {
      return (episode.panels || []).map(function (panel) {
        return stripFourPanelStoryboardSubtitles(panel.content || "");
      }).filter(Boolean).join("\n\n");
    }
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

  function stripFourPanelStoryboardSubtitles(content) {
    return String(content || "").split("\n").filter(function (line) {
      return !isFourPanelStoryboardSubtitleLine(line);
    }).join("\n").trim();
  }

  function hasFourPanelStoryboardSubtitle(content) {
    return String(content || "").split("\n").some(isFourPanelStoryboardSubtitleLine);
  }

  function isFourPanelStoryboardSubtitleLine(line) {
    var trimmed = line.trim();
    if (trimmed.indexOf("#") === 0) {
      return true;
    }
    return ["【起】", "【承】", "【转】", "【合】", "起：", "承：", "转：", "合：", "起:", "承:", "转:", "合:", "第1格", "第2格", "第3格", "第4格", "第 1 格", "第 2 格", "第 3 格", "第 4 格", "第一格", "第二格", "第三格", "第四格"].some(function (marker) {
      return trimmed.indexOf(marker) !== -1;
    });
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

  function appendLongBatchStoryboardDelta(delta) {
    state.project.rawLongBatchStoryboard += delta;
    els.rawLongBatchStoryboard.value = state.project.rawLongBatchStoryboard;
    els.rawLongBatchStoryboard.scrollTop = els.rawLongBatchStoryboard.scrollHeight;
  }

  function resetLongBatchStoryboardOutput() {
    state.project.rawLongBatchStoryboard = "";
    els.rawLongBatchStoryboard.value = "";
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
    return effectiveCharacters().find(function (character) {
      return character.series + "/" + character.id === fullID;
    });
  }

  function effectiveCharacters() {
    return upsertCharacterSettings(data.characters, state.characterSettings);
  }

  function upsertCharacterSettings(current, replacements) {
    var byID = {};
    current.concat(replacements).forEach(function (character) {
      byID[character.series + "/" + character.id] = character;
    });
    return Object.keys(byID).sort().map(function (fullID) {
      return byID[fullID];
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

  function confirmContentOverwrite(content, message) {
    if (!String(content || "").trim()) {
      return Promise.resolve(true);
    }
    if (!els.overwritePromptDialog || typeof els.overwritePromptDialog.showModal !== "function") {
      return Promise.resolve(window.confirm(message));
    }

    els.overwritePromptMessage.textContent = message;
    return new Promise(function (resolve) {
      function onClose() {
        els.overwritePromptDialog.removeEventListener("close", onClose);
        resolve(els.overwritePromptDialog.returnValue === "confirm");
      }
      els.overwritePromptDialog.addEventListener("close", onClose);
      els.overwritePromptDialog.returnValue = "cancel";
      els.overwritePromptDialog.showModal();
    });
  }

  function promptListContent(prompts) {
    return (prompts || []).map(function (item) {
      return item.prompt || "";
    }).join("\n");
  }

  function rawListContent(items) {
    return (items || []).map(function (item) {
      return item.raw || "";
    }).join("\n");
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
    downloadJSON(persistableProject(state.project), "lovelive-engine-project-" + state.project.id + ".json");
  }

  function downloadJSON(value, filename) {
    var blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function readHistory() {
    return readJSON(historyKey, []).map(hydrateProject).map(persistableProject);
  }

  function hydrateProject(project) {
    var hydrated = merge(defaultProject(), project);
    if (project && !Object.prototype.hasOwnProperty.call(project, "storyLengthEnabled") && project.storyLength > 0) {
      hydrated.storyLengthEnabled = true;
    }
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

  function loadCharacterSettings(characters) {
    if (!Array.isArray(characters)) {
      return [];
    }
    return characters.map(normalizeCharacterSetting).filter(Boolean);
  }

  function normalizeCharacterSetting(character) {
    if (!character || typeof character !== "object" || !character.appearance || typeof character.appearance !== "object") {
      return null;
    }
    var required = [
      character.id,
      character.name,
      character.series,
      character.personality,
      character.appearance.hair_style,
      character.appearance.hair_color,
      character.appearance.eye_shape,
      character.appearance.eye_color,
      character.appearance.height,
      character.appearance.body_type,
      character.appearance.other
    ];
    if (required.some(function (value) { return typeof value !== "string" || !value.trim(); })) {
      return null;
    }
    if (!isValidCharacterID(character.series) || !isValidCharacterID(character.id)) {
      return null;
    }
    return {
      id: character.id.trim(),
      name: character.name.trim(),
      name_en: typeof character.name_en === "string" ? character.name_en.trim() : "",
      series: character.series.trim(),
      appearance: {
        hair_style: character.appearance.hair_style.trim(),
        hair_color: character.appearance.hair_color.trim(),
        eye_shape: character.appearance.eye_shape.trim(),
        eye_color: character.appearance.eye_color.trim(),
        height: character.appearance.height.trim(),
        body_type: character.appearance.body_type.trim(),
        other: character.appearance.other.trim()
      },
      personality: character.personality.trim(),
      tags: Array.isArray(character.tags) ? character.tags.filter(function (tag) {
        return typeof tag === "string" && tag.trim();
      }).map(function (tag) {
        return tag.trim();
      }) : []
    };
  }

  function isValidCharacterID(value) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
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
