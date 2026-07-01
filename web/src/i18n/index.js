import enUS from "./en-US";
import zhCN from "./zh-CN";

export const locales = {
  "zh-CN": zhCN,
  "en-US": enUS
};

export function getInitialLocale() {
  var saved = localStorage.getItem("lovelive-engine-web-locale");
  if (saved && locales[saved]) {
    return saved;
  }
  return navigator.language && navigator.language.toLowerCase().indexOf("zh") === 0 ? "zh-CN" : "en-US";
}

export function setDocumentLocale(locale) {
  document.documentElement.lang = locale;
  localStorage.setItem("lovelive-engine-web-locale", locale);
}
