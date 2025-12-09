const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "dist");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

esbuild
  .build({
    entryPoints: [path.join(__dirname, "src", "index.ts")],
    outfile: path.join(outDir, "widget.js"),
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "PaceCtrlWidget",
    sourcemap: true,
    target: "es2017"
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
