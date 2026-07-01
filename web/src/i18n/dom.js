import { locales } from "./index";

var observer = null;
var translating = false;
var originalAlert = window.alert;

export function startDOMTranslations(locale) {
  stopDOMTranslations();
  if (locale === "zh-CN") {
    window.alert = originalAlert;
    return;
  }

  window.alert = function (message) {
    originalAlert(translateCompactText(String(message || ""), locales[locale].dom));
  };
  applyDOMTranslations(locale, document.body);
  observer = new MutationObserver(function (mutations) {
    if (translating) {
      return;
    }
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          applyDOMTranslations(locale, node);
        }
      });
      if (mutation.type === "characterData") {
        applyDOMTranslations(locale, mutation.target);
      }
      if (mutation.type === "attributes") {
        applyDOMTranslations(locale, mutation.target);
      }
    });
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["placeholder", "title", "aria-label", "value"],
    characterData: true,
    childList: true,
    subtree: true
  });
}

export function stopDOMTranslations() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function applyDOMTranslations(locale, root) {
  var dictionary = locales[locale] && locales[locale].dom;
  if (!dictionary || !root) {
    return;
  }

  translating = true;
  try {
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root, dictionary);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    translateElement(root, dictionary);
    root.querySelectorAll("*").forEach(function (element) {
      translateElement(element, dictionary);
    });
  } finally {
    translating = false;
  }
}

function translateElement(element, dictionary) {
  if (!shouldSkipTextContent(element)) {
    element.childNodes.forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        translateTextNode(child, dictionary);
      }
    });
  }
  translateAttributes(element, dictionary);
}

function translateTextNode(node, dictionary) {
  if (!node.parentElement || shouldSkipTextContent(node.parentElement)) {
    return;
  }
  var original = node.nodeValue;
  var translated = translateText(original, dictionary);
  if (translated !== original) {
    node.nodeValue = translated;
  }
}

function translateAttributes(element, dictionary) {
  ["placeholder", "title", "aria-label"].forEach(function (name) {
    var value = element.getAttribute(name);
    if (!value) {
      return;
    }
    var translated = translateAttribute(value, dictionary);
    if (translated !== value) {
      element.setAttribute(name, translated);
    }
  });

  if (element.tagName === "INPUT" && element.type === "text" && element.value === "中文") {
    element.value = "Chinese";
  }
}

function translateText(value, dictionary) {
  var leading = value.match(/^\s*/)[0];
  var trailing = value.match(/\s*$/)[0];
  var text = value.trim();
  if (!text) {
    return value;
  }
  return leading + translateCompactText(text, dictionary) + trailing;
}

function translateAttribute(value, dictionary) {
  return translateCompactText(value.trim(), dictionary);
}

function translateCompactText(text, dictionary) {
  if (dictionary.text[text]) {
    return dictionary.text[text];
  }
  if (dictionary.attributes[text]) {
    return dictionary.attributes[text];
  }
  return translatePattern(text);
}

function translatePattern(text) {
  var match = text.match(/^共 (\d+) 个$/);
  if (match) {
    return match[1] + " total";
  }
  match = text.match(/^分镜 (\d+)$/);
  if (match) {
    return "Storyboard " + match[1];
  }
  match = text.match(/^图片 Prompt (\d+)$/);
  if (match) {
    return "Image Prompt " + match[1];
  }
  match = text.match(/^图片 (\d+)( [✓!])?$/);
  if (match) {
    return "Image " + match[1] + (match[2] || "");
  }
  match = text.match(/^第 (\d+) 话( ✓)?$/);
  if (match) {
    return "Episode " + match[1] + (match[2] || "");
  }
  match = text.match(/^第 (\d+) 话分镜脚本$/);
  if (match) {
    return "Episode " + match[1] + " Storyboard Script";
  }
  match = text.match(/^已解析：第 (\d+) 话，(\d+) 格$/);
  if (match) {
    return "Parsed: episode " + match[1] + ", " + match[2] + " panel(s)";
  }
  match = text.match(/^第 (\d+) 格：(.*)$/);
  if (match) {
    return "Panel " + match[1] + ": " + match[2];
  }
  match = text.match(/^第 (\d+) 话《(.+)》梗概$/);
  if (match) {
    return "Episode " + match[1] + " Outline: " + match[2];
  }
  match = text.match(/^候选 (\d+)《(.+)》$/);
  if (match) {
    return "Candidate " + match[1] + ": " + match[2];
  }
  match = text.match(/^第 (\d+) 话《(.+)》$/);
  if (match) {
    return "Episode " + match[1] + ": " + match[2];
  }
  match = text.match(/^请先完成第 (\d+) 话解析，再生成下一话 Prompt。$/);
  if (match) {
    return "Finish parsing episode " + match[1] + " before generating the next prompt.";
  }
  match = text.match(/^选择候选 (\d+)《(.+)》$/);
  if (match) {
    return "Select candidate " + match[1] + ": " + match[2];
  }
  if (text.indexOf("请先在设置中补全：") === 0) {
    return text.replace("请先在设置中补全：", "Complete these settings first: ").replace("。", ".").replaceAll("、", ", ");
  }
  if (text.indexOf("请检查文本模型 API 配置后重试。") === 0) {
    return text.replace("请检查文本模型 API 配置后重试。", "Check the text model API settings and try again.");
  }
  if (text.indexOf("请检查图片模型 API 配置后重试。") === 0) {
    return text.replace("请检查图片模型 API 配置后重试。", "Check the image model API settings and try again.");
  }
  if (text.indexOf("导入角色设定失败：") === 0) {
    return text.replace("导入角色设定失败：", "Failed to import character settings: ");
  }
  if (text.indexOf("设定文档必须包含 characters 数组。") === 0) {
    return text.replace("设定文档必须包含 characters 数组。", "The settings document must contain a characters array.");
  }
  if (text.indexOf("设定文档包含字段缺失或 ID 格式错误的角色。请检查文档后重试。") === 0) {
    return text.replace("设定文档包含字段缺失或 ID 格式错误的角色。请检查文档后重试。", "The settings document contains characters with missing fields or invalid IDs. Check the document and try again.");
  }
  return text;
}

function shouldSkipTextContent(element) {
  return ["SCRIPT", "STYLE", "TEXTAREA"].indexOf(element.tagName) !== -1;
}
