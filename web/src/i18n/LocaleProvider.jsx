import { createContext, useContext, useEffect, useState } from "react";
import { getInitialLocale, setDocumentLocale, locales } from "./index.js";
import { englishStyles } from "./styles.js";
const Context = createContext(null);
export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(getInitialLocale);
  const dictionary = locales[locale].workspace;
  useEffect(() => {
    setDocumentLocale(locale);
    document.title = dictionary.brand;
  }, [locale]);
  const t = (key, values = {}) =>
    Object.entries(values).reduce(
      (text, [k, v]) => text.replaceAll("{" + k + "}", v),
      dictionary[key] || key,
    );
  const name = (item) =>
    locale === "en-US"
      ? item.name_en || englishStyles[item.id]?.[0] || item.id
      : item.name || item.id;
  const description = (item) =>
    locale === "en-US"
      ? englishStyles[item.id]?.[1] || ""
      : item.description || "";
  return (
    <Context.Provider value={{ locale, setLocale, t, name, description }}>
      {children}
    </Context.Provider>
  );
}
export const useLocale = () => useContext(Context);
