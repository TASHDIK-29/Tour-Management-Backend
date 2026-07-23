/*
 * tsc only emits .ts -> .js; the .ejs email templates are non-code assets it
 * ignores. Without this copy, `dist/app/utils/templates` keeps whatever stale
 * files were there (or none), so production emails render the wrong template.
 * Runs after `tsc` (see package.json "build").
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "app", "utils", "templates");
const dest = path.join(__dirname, "..", "dist", "app", "utils", "templates");

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });

console.log(`Copied email templates -> ${path.relative(process.cwd(), dest)}`);
