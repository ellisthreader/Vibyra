import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const collect = directory => fs.readdirSync(path.join(root, directory)).filter(name => /\.(jsx?|mjs|css)$/.test(name)).map(name => path.join(directory, name));
const files = [
  ...collect("resources/js/portal/owner"),
  ...collect("resources/css/portal").filter(name => path.basename(name).startsWith("owner-")),
  ...collect("preview"),
  "resources/js/portal/pages/OwnerPage.jsx",
  "resources/js/portal/pages/AuthPage.jsx",
  "resources/js/portal/components/AuthShell.jsx",
  "resources/css/portal.css",
];
const counts = files.map(file => [file, fs.readFileSync(path.join(root, file), "utf8").trimEnd().split("\n").length]);
const failures = counts.filter(([, count]) => count > 200);
if (failures.length) {
  console.error(failures.map(([file, count]) => file + ": " + count + " lines (maximum 200)").join("\n"));
  process.exitCode = 1;
} else console.log("Owner source gate passed: " + counts.length + " files, maximum " + Math.max(...counts.map(([, count]) => count)) + " lines.");
