import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(projectDir, "dist", "cli-command-builder.html");

const [html, css, javascript] = await Promise.all([
  fs.readFile(path.join(projectDir, "index.html"), "utf8"),
  fs.readFile(path.join(projectDir, "styles.css"), "utf8"),
  fs.readFile(path.join(projectDir, "app.js"), "utf8")
]);

const output = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>${css}</style>`)
  .replace('<script src="app.js" defer></script>', `<script>${javascript}</script>`);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, output, "utf8");

console.log(`Built ${path.relative(projectDir, outputPath)}`);
