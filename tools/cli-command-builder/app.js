(function (root) {
  "use strict";

  const MODE_DESCRIPTIONS = {
    create: "填写新漫画所需的角色、剧情与画风",
    resume: "继续已有项目，或重试指定图片",
    list: "生成查询角色、画风或模型的指令"
  };

  function quoteShell(value) {
    const text = String(value);
    if (/^[A-Za-z0-9_./:=,+-]+$/.test(text)) {
      return text;
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

    function readConfig() {
      const selectedListType = document.querySelector('input[name="listType"]:checked');
      return {
        mode,
        executable: document.getElementById("executable").value,
        characters: document.getElementById("characters").value,
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
      document.getElementById("language").value = "中文";
      document.getElementById("executable").selectedIndex = 0;
      setMode("create");
    });

    render();
  }

  const api = { buildCommand, quoteShell, validateConfig };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CLICommandBuilder = api;
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", initialize);
})(typeof window !== "undefined" ? window : globalThis);
