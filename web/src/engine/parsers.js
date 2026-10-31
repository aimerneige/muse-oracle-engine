export function extractCodeBlocksWithLanguage(markdown, language) {
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

export function parseJSONBlock(text) {
  var blocks = extractCodeBlocksWithLanguage(text, "json");
  var payload = blocks.length > 0 ? blocks[0] : text;
  return JSON.parse(payload.trim());
}

export function normalizeStandardStoryboard(payload) {
  var episodes = Array.isArray(payload) ? payload : payload && payload.episodes;
  if (!Array.isArray(episodes) || episodes.length === 0) {
    throw new Error("Storyboard contains no episodes.");
  }
  return episodes.map(function (episode, index) {
    if (!episode || !Array.isArray(episode.panels)) {
      throw new Error(
        "Storyboard episode " + (index + 1) + " contains no panels.",
      );
    }
    if (episode.panels.length !== 4) {
      throw new Error(
        "Storyboard episode " +
          (index + 1) +
          " must contain exactly 4 panels, got " +
          episode.panels.length +
          ".",
      );
    }
    episode.episode = episode.episode || index + 1;
    episode.panels = episode.panels.map(function (panel, panelIndex) {
      return {
        index: panel.index || panelIndex + 1,
        content: panel.content || "",
      };
    });
    return episode;
  });
}

export function normalizeLongOutline(outline) {
  if (
    !outline ||
    !Array.isArray(outline.episodes) ||
    outline.episodes.length === 0
  ) {
    throw new Error("Long manga outline contains no episodes.");
  }
  outline.total_episodes = outline.total_episodes || outline.episodes.length;
  outline.episodes = outline.episodes.map(function (episode, index) {
    return {
      episode: episode.episode || index + 1,
      title: episode.title || "",
      summary: episode.summary || "",
      character_ids: episode.character_ids || [],
    };
  });
  return outline;
}

export function normalizeLongEpisode(script, outline) {
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
      content: panel.content || "",
    };
  });
  script.costume_states = script.costume_states || [];
  return script;
}

export function normalizeLongBatchStoryboard(payload, project) {
  var state = { project };
  var scripts = Array.isArray(payload) ? payload : payload && payload.episodes;
  if (!Array.isArray(scripts) || scripts.length === 0) {
    throw new Error("Long manga batch storyboard contains no episodes.");
  }
  if (
    !state.project.longOutline ||
    !Array.isArray(state.project.longOutline.episodes)
  ) {
    throw new Error(
      "Long manga outline is required before parsing batch storyboard.",
    );
  }
  var byEpisode = {};
  scripts.forEach(function (script) {
    if (!script || !script.episode) {
      throw new Error(
        "Long manga batch storyboard contains episode without number.",
      );
    }
    if (byEpisode[script.episode]) {
      throw new Error(
        "Long manga batch storyboard contains duplicate episode " +
          script.episode +
          ".",
      );
    }
    byEpisode[script.episode] = script;
  });
  var normalized = state.project.longOutline.episodes.map(function (outline) {
    var script = byEpisode[outline.episode];
    if (!script) {
      throw new Error(
        "Long manga batch storyboard missing episode " + outline.episode + ".",
      );
    }
    script = normalizeLongEpisode(script, outline);
    validateBatchCostumeStates(script);
    delete byEpisode[outline.episode];
    return script;
  });
  var extraEpisodes = Object.keys(byEpisode);
  if (extraEpisodes.length > 0) {
    throw new Error(
      "Long manga batch storyboard contains extra episode(s): " +
        extraEpisodes.join(", ") +
        ".",
    );
  }
  return normalized;
}

export function validateBatchCostumeStates(script) {
  var seen = {};
  (script.costume_states || []).forEach(function (costume) {
    if (costume.character_id && costume.outfit) {
      seen[costume.character_id] = true;
    }
  });
  (script.character_ids || []).forEach(function (id) {
    if (!seen[id]) {
      throw new Error(
        "Episode " + script.episode + " missing costume state for " + id + ".",
      );
    }
  });
}

export function longMangaEpisodeContent(episode, fourPanelMode) {
  if (fourPanelMode) {
    return (episode.panels || [])
      .map(function (panel) {
        return stripFourPanelStoryboardSubtitles(panel.content || "");
      })
      .filter(Boolean)
      .join("\n\n");
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

export function stripFourPanelStoryboardSubtitles(content) {
  return String(content || "")
    .split("\n")
    .filter(function (line) {
      return !isFourPanelStoryboardSubtitleLine(line);
    })
    .join("\n")
    .trim();
}

export function hasFourPanelStoryboardSubtitle(content) {
  return String(content || "")
    .split("\n")
    .some(isFourPanelStoryboardSubtitleLine);
}

export function isFourPanelStoryboardSubtitleLine(line) {
  var trimmed = line.trim();
  if (trimmed.indexOf("#") === 0) {
    return true;
  }
  return [
    "【起】",
    "【承】",
    "【转】",
    "【合】",
    "起：",
    "承：",
    "转：",
    "合：",
    "起:",
    "承:",
    "转:",
    "合:",
    "第1格",
    "第2格",
    "第3格",
    "第4格",
    "第 1 格",
    "第 2 格",
    "第 3 格",
    "第 4 格",
    "第一格",
    "第二格",
    "第三格",
    "第四格",
  ].some(function (marker) {
    return trimmed.indexOf(marker) !== -1;
  });
}
