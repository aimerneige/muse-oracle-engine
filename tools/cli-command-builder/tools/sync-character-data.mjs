import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDir = path.resolve(projectDir, "../..");
const sourcePath = path.join(repositoryDir, "web", "src", "data.js");
const outputPath = path.join(projectDir, "character-data.js");
const source = (await fs.readFile(sourcePath, "utf8")).trim();
const prefix = "window.LLE_DATA = ";

if (!source.startsWith(prefix) || !source.endsWith(";")) {
  throw new Error("web/src/data.js does not match the expected LLE_DATA assignment");
}

const data = JSON.parse(source.slice(prefix.length, -1));
const characterData = {
  series: data.series.map(({ id, name, name_en }) => ({ id, name, name_en })),
  characters: data.characters.map(({ id, name, name_en, series }) => ({ id, name, name_en, series }))
};
const output = `globalThis.LLE_CHARACTER_DATA = ${JSON.stringify(characterData, null, 2)};\n`;

await fs.writeFile(outputPath, output, "utf8");

console.log(`Synced ${characterData.characters.length} characters from ${characterData.series.length} series`);
