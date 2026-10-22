// Fails when the published package is missing its build output, or ships files it shouldn't (tests, the
// example app, config). Run after `yarn prepare`.
import { execSync } from "node:child_process";

const REQUIRED = [
    "LICENSE",
    "README.md",
    "package.json",
    "lib/module/index.js",
    "lib/typescript/src/index.d.ts",
    "src/index.tsx",
];
const FORBIDDEN = [/__tests__/, /^example\//, /^node_modules\//, /^\.github\//, /^\.changeset\//, /^scripts\//];

const raw = execSync("npm pack --dry-run --json --ignore-scripts", { encoding: "utf8" });
// Some npm versions still run the `prepare` build and print its log before the JSON; keep only the JSON.
const output = JSON.parse(raw.slice(raw.search(/^[[{]/m)));
// npm 11 and earlier print an array; npm 12 prints an object keyed by package name.
const pack = Array.isArray(output) ? output[0] : Object.values(output)[0];
const files = pack.files.map((file) => file.path.replaceAll("\\", "/")).sort();
const problems = [];

for (const required of REQUIRED) {
    if (!files.includes(required)) problems.push(`missing from the package: ${required}`);
}
for (const file of files) {
    if (FORBIDDEN.some((pattern) => pattern.test(file))) problems.push(`should not be published: ${file}`);
}

if (problems.length > 0) {
    console.error(`check:pack failed:\n  ${problems.join("\n  ")}`);
    process.exit(1);
}
console.log(`check:pack ok: ${files.length} files`);
