/**
 * Prepares web_modules for pixi.js and @fontsource/open-sans.
 * Run from public/ directory.
 * - pixi.js: copied from node_modules pre-built bundle (esinstall fails on its exports)
 * - @fontsource/open-sans: copied from node_modules (esinstall fails on font packages)
 */
const path = require("path");
const fs = require("fs");

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  const cwd = path.resolve(__dirname, "..");
  const webModulesDir = path.join(cwd, "web_modules");

  if (!fs.existsSync(webModulesDir)) {
    fs.mkdirSync(webModulesDir, { recursive: true });
  }

  // Copy pixi.js pre-built ESM bundle
  const pixiSrc = path.join(cwd, "node_modules", "pixi.js", "dist", "pixi.mjs");
  const pixiDest = path.join(webModulesDir, "pixi.js.js");
  if (fs.existsSync(pixiSrc)) {
    fs.copyFileSync(pixiSrc, pixiDest);
    console.log("Copied pixi.js bundle to web_modules/pixi.js.js");
  } else {
    throw new Error(`pixi.js bundle not found at ${pixiSrc}`);
  }

  // Copy @fontsource/open-sans for CSS import
  const fontSrc = path.join(cwd, "node_modules", "@fontsource", "open-sans");
  const fontDest = path.join(webModulesDir, "@fontsource", "open-sans");
  if (fs.existsSync(fontSrc)) {
    copyRecursive(fontSrc, fontDest);
    console.log("Copied @fontsource/open-sans to web_modules/@fontsource/open-sans");
  } else {
    throw new Error(`@fontsource/open-sans not found at ${fontSrc}`);
  }

  console.log("web_modules prepared successfully.");
}

main();
