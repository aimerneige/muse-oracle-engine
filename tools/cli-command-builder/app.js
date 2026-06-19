(function (root) {
  "use strict";

  const MODE_DESCRIPTIONS = {
    create: "填写新漫画所需的角色、剧情与画风",
    resume: "继续已有项目，或重试指定图片",
    list: "生成查询角色、画风或模型的指令"
  };
  const MAX_VISIBLE_CHARACTERS = 48;

  function quoteShell(value) {
    const text = String(value);
    if (/^[A-Za-z0-9_./:=,+-]+$/.test(text)) {
      return text;
    }
    if (/[\x00-\x1f\x7f]/.test(text)) {
      return "$'" + Array.from(text).map(function (character) {
        const escapes = {
          "\\": "\\\\",
          "'": "\\'",
          "\b": "\\b",
          "\t": "\\t",
          "\n": "\\n",
          "\v": "\\v",
          "\f": "\\f",
          "\r": "\\r"
        };
        if (escapes[character]) return escapes[character];

        const code = character.charCodeAt(0);
        if (code < 32 || code === 127) {
          return "\\x" + code.toString(16).padStart(2, "0");
        }
        return character;
      }).join("") + "'";
    }
    return "'" + text.replace(/'/g, "'\\''") + "'";
  }

  function validateConfig(config) {
    const errors = [];

    if (config.mode === "create") {
      if (!config.characters.trim()) errors.push("请填写至少一个角色 ID");
      if (!config.plot.trim()) errors.push("请填写剧情方向");
      if (!config.style) errors.push("请选择漫画画风");
      if (!config.language.trim()) errors.push("请填写对白语言");
    }

    if (config.mode === "resume") {
      if (!config.resume.trim()) errors.push("请填写要恢复的项目 ID");
      if (config.retryImage !== "" && (!Number.isInteger(Number(config.retryImage)) || Number(config.retryImage) < 1)) {
        errors.push("重试图片序号必须是大于 0 的整数");
      }
    }

    return errors;
  }

  function filterCharacters(data, series, query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!series && !normalizedQuery) return [];

    return data.characters.filter(function (character) {
      if (series && character.series !== series) return false;
      if (!normalizedQuery) return true;

      const fullID = character.series + "/" + character.id;
      return [fullID, character.name, character.name_en]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }

  function mergeCharacterIDs(selectedIDs, customValue) {
    const customIDs = customValue.split(",").map(function (id) {
      return id.trim();
    }).filter(Boolean);
    return Array.from(new Set(selectedIDs.concat(customIDs)));
  }

  function buildCommand(config) {
    const parts = [config.executable];
    const parameters = [];

    function addValue(name, value) {
      if (String(value).trim() === "") return;
      parts.push("--" + name, quoteShell(String(value).trim()));
      parameters.push("--" + name);
    }

    function addFlag(name, enabled) {
      if (!enabled) return;
      parts.push("--" + name);
      parameters.push("--" + name);
    }

    if (config.mode === "create") {
      addValue("characters", config.characters);
      addValue("plot", config.plot);
      addValue("style", config.style);
      addValue("language", config.language);
      addFlag("prompt-only", config.promptOnly);
      addFlag("long-manga", config.longManga);
    } else if (config.mode === "resume") {
      addValue("resume", config.resume);
      addValue("retry-image", config.retryImage);
      addFlag("prompt-only", config.promptOnly);
      addFlag("long-manga", config.longManga);
    } else {
      addFlag(config.listType, true);
    }

    return {
      command: parts.join(" "),
      errors: validateConfig(config),
      parameters
    };
  }

  function initialize() {
    const characterData = root.LLE_CHARACTER_DATA || { series: [], characters: [] };
    const form = document.getElementById("commandForm");
    const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));
    const fields = {
      create: document.getElementById("createFields"),
      resume: document.getElementById("resumeFields"),
      list: document.getElementById("listFields")
    };
    const flowOptions = document.getElementById("flowOptions");
    const output = document.getElementById("commandOutput");
    const validation = document.getElementById("validationMessage");
    const enabledParameters = document.getElementById("enabledParameters");
    const copyButton = document.getElementById("copyButton");
    let mode = "create";
    let currentCommand = "";
    let selectedCharacterIDs = [];

    function fullCharacterID(character) {
      return character.series + "/" + character.id;
    }

    function getCharacter(fullID) {
      return characterData.characters.find(function (character) {
        return fullCharacterID(character) === fullID;
      });
    }

    function hydrateSeriesFilter() {
      const seriesFilter = document.getElementById("seriesFilter");
      characterData.series.forEach(function (series) {
        const option = document.createElement("option");
        option.value = series.id;
        option.textContent = series.name + "（" + series.id + "）";
        seriesFilter.append(option);
      });
    }

    function renderCharacterList() {
      const container = document.getElementById("characterList");
      const series = document.getElementById("seriesFilter").value;
      const query = document.getElementById("characterSearch").value;
      const matches = filterCharacters(characterData, series, query);
      container.replaceChildren();

      if (!series && !query.trim()) {
        const hint = document.createElement("p");
        hint.className = "character-empty";
        hint.textContent = "选择一个作品，或输入关键词开始搜索。";
        container.append(hint);
        return;
      }

      if (matches.length === 0) {
        const empty = document.createElement("p");
        empty.className = "character-empty";
        empty.textContent = "没有找到匹配的角色。";
        container.append(empty);
        return;
      }

      matches.slice(0, MAX_VISIBLE_CHARACTERS).forEach(function (character) {
        const fullID = fullCharacterID(character);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "character-option";
        button.classList.toggle("selected", selectedCharacterIDs.includes(fullID));
        button.setAttribute("aria-pressed", String(selectedCharacterIDs.includes(fullID)));
        button.innerHTML = "<strong></strong><small></small>";
        button.querySelector("strong").textContent = character.name;
        button.querySelector("small").textContent = fullID;
        button.addEventListener("click", function () {
          toggleCharacter(fullID);
        });
        container.append(button);
      });

      if (matches.length > MAX_VISIBLE_CHARACTERS) {
        const overflow = document.createElement("p");
        overflow.className = "character-overflow";
        overflow.textContent = "共 " + matches.length + " 个结果，当前显示前 " + MAX_VISIBLE_CHARACTERS + " 个，请继续缩小范围。";
        container.append(overflow);
      }
    }

    function renderSelectedCharacters() {
      const container = document.getElementById("selectedCharacters");
      container.replaceChildren();
      document.getElementById("selectedCharacterCount").textContent = "已选 " + selectedCharacterIDs.length;

      if (selectedCharacterIDs.length === 0) {
        const empty = document.createElement("span");
        empty.className = "selected-empty";
        empty.textContent = "尚未选择角色";
        container.append(empty);
        return;
      }

      selectedCharacterIDs.forEach(function (fullID) {
        const character = getCharacter(fullID);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "selected-character";
        button.textContent = (character ? character.name : fullID) + " ×";
        button.title = "移除 " + fullID;
        button.addEventListener("click", function () {
          toggleCharacter(fullID);
        });
        container.append(button);
      });
    }

    function toggleCharacter(fullID) {
      if (selectedCharacterIDs.includes(fullID)) {
        selectedCharacterIDs = selectedCharacterIDs.filter(function (id) {
          return id !== fullID;
        });
      } else {
        selectedCharacterIDs = selectedCharacterIDs.concat(fullID);
      }
      renderCharacterList();
      renderSelectedCharacters();
      render();
    }

    function readConfig() {
      const selectedListType = document.querySelector('input[name="listType"]:checked');
      return {
        mode,
        executable: document.getElementById("executable").value,
        characters: mergeCharacterIDs(
          selectedCharacterIDs,
          document.getElementById("customCharacters").value
        ).join(","),
        plot: document.getElementById("plot").value,
        style: document.getElementById("style").value,
        language: document.getElementById("language").value,
        resume: document.getElementById("resume").value,
        retryImage: document.getElementById("retryImage").value,
        listType: selectedListType ? selectedListType.value : "list-characters",
        promptOnly: document.getElementById("promptOnly").checked,
        longManga: document.getElementById("longManga").checked
      };
    }

    function renderParameters(parameters) {
      enabledParameters.replaceChildren();
      if (parameters.length === 0) {
        const empty = document.createElement("span");
        empty.className = "empty-tag";
        empty.textContent = "等待配置";
        enabledParameters.append(empty);
        return;
      }

      parameters.forEach(function (parameter) {
        const tag = document.createElement("span");
        tag.textContent = parameter;
        enabledParameters.append(tag);
      });
    }

    function render() {
      const result = buildCommand(readConfig());
      currentCommand = result.command;
      output.textContent = result.command;
      validation.textContent = result.errors.join(" · ");
      copyButton.disabled = result.errors.length > 0;
      renderParameters(result.parameters);
    }

    function setMode(nextMode) {
      mode = nextMode;
      modeTabs.forEach(function (tab) {
        const active = tab.dataset.mode === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      Object.keys(fields).forEach(function (key) {
        fields[key].classList.toggle("hidden", key !== mode);
      });
      flowOptions.classList.toggle("hidden", mode === "list");
      document.getElementById("modeDescription").textContent = MODE_DESCRIPTIONS[mode];
      render();
    }

    modeTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        setMode(tab.dataset.mode);
      });
    });

    form.addEventListener("input", render);
    form.addEventListener("change", render);
    document.getElementById("executable").addEventListener("change", render);
    document.getElementById("seriesFilter").addEventListener("change", renderCharacterList);
    document.getElementById("characterSearch").addEventListener("input", renderCharacterList);
    document.getElementById("clearCharacters").addEventListener("click", function () {
      selectedCharacterIDs = [];
      renderCharacterList();
      renderSelectedCharacters();
      render();
    });

    copyButton.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(currentCommand);
        copyButton.textContent = "已复制";
        window.setTimeout(function () {
          copyButton.textContent = "复制指令";
        }, 1400);
      } catch (error) {
        validation.textContent = "浏览器未允许访问剪贴板，请手动选择上方指令复制";
      }
    });

    document.getElementById("resetButton").addEventListener("click", function () {
      form.reset();
      selectedCharacterIDs = [];
      document.getElementById("language").value = "中文";
      document.getElementById("executable").selectedIndex = 0;
      renderCharacterList();
      renderSelectedCharacters();
      setMode("create");
    });

    hydrateSeriesFilter();
    renderCharacterList();
    renderSelectedCharacters();
    render();
  }

  const api = { buildCommand, filterCharacters, mergeCharacterIDs, quoteShell, validateConfig };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CLICommandBuilder = api;
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initialize);
})(typeof window !== "undefined" ? window : globalThis);
