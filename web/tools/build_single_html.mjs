#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const options = parseArgs(process.argv.slice(2));

const [html, css, appJS, dataJS] = await Promise.all([
  readText("web/index.html"),
  readText("web/src/styles.css"),
  readText("web/src/app.js"),
  readText("web/src/data.js")
]);

const data = filterData(parseData(dataJS), options.series);
const bundledJS = "window.LLE_DATA=" + JSON.stringify(data) + ";\n" + appJS;
const minifiedJS = await minifyJS(bundledJS);
const output = buildHTML(html, minifyCSS(css), minifiedJS);

await fs.mkdir(path.dirname(path.resolve(rootDir, options.out)), { recursive: true });
await fs.writeFile(path.resolve(rootDir, options.out), output, "utf8");

console.log("Built " + options.out);
console.log("Series: " + (options.series.length > 0 ? options.series.join(",") : "all"));
console.log("Characters: " + data.characters.length);

function parseArgs(args) {
  const parsed = {
    out: "web/dist/lovelive-engine.single.html",
    series: []
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--out") {
      parsed.out = requireValue(args, i);
      i += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      parsed.out = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--series") {
      parsed.series = splitSeries(requireValue(args, i));
      i += 1;
      continue;
    }
    if (arg.startsWith("--series=")) {
      parsed.series = splitSeries(arg.slice("--series=".length));
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error("Unknown argument: " + arg);
  }

  return parsed;
}

function requireValue(args, index) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("Missing value for " + args[index]);
  }
  return value;
}

function splitSeries(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function printUsage() {
  console.log("Usage: node web/tools/build_single_html.mjs [--series lovelive,lovelive-sunshine] [--out web/dist/app.html]");
}

async function readText(relativePath) {
  return fs.readFile(path.resolve(rootDir, relativePath), "utf8");
}

function parseData(source) {
  const prefix = "window.LLE_DATA = ";
  const trimmed = source.trim();
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(";")) {
    throw new Error("web/src/data.js does not match the expected LLE_DATA assignment.");
  }
  return JSON.parse(trimmed.slice(prefix.length, -1));
}

function filterData(data, seriesIDs) {
  if (seriesIDs.length === 0) {
    return data;
  }

  const selected = new Set(seriesIDs);
  const known = new Set(data.series.map((series) => series.id));
  const unknown = seriesIDs.filter((seriesID) => !known.has(seriesID));
  if (unknown.length > 0) {
    throw new Error("Unknown series: " + unknown.join(","));
  }

  return {
    ...data,
    series: data.series.filter((series) => selected.has(series.id)),
    characters: data.characters.filter((character) => selected.has(character.series))
  };
}

async function minifyJS(source) {
  const result = await minify(source, {
    compress: {
      passes: 2
    },
    format: {
      comments: false
    },
    mangle: {
      toplevel: true
    },
    toplevel: true
  });

  if (!result.code) {
    throw new Error("Terser returned empty output.");
  }
  return result.code;
}

function minifyCSS(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>])\s*/g, "$1")
    .trim();
}

function buildHTML(source, css, js) {
  return source
    .replace(/<link rel="stylesheet" href="src\/styles\.css">\s*/u, "<style>" + css + "</style>")
    .replace(/\s*<script src="src\/data\.js"><\/script>/u, "")
    .replace(/\s*<script src="src\/app\.js"><\/script>/u, "<script>" + js + "</script>")
    .replace(/>\s+</g, "><")
    .trim() + "\n";
}
