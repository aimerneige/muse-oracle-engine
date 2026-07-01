import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getInitialLocale } from "./i18n";
import { startDOMTranslations } from "./i18n/dom";
import "./styles.css";
import "./generated/data.js";

flushSync(function () {
  createRoot(document.getElementById("root")).render(<App />);
});

await import("./app.js");
startDOMTranslations(getInitialLocale());
