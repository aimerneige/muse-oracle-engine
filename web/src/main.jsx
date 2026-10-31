import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";
import "./styles/app.css";
import "./generated/data.js";

createRoot(document.getElementById("root")).render(<App />);
