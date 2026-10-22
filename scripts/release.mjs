// Publishes the current version to npm if it isn't there yet, then tags it. Run by the Release workflow once
// no changesets are pending. Safe to run on every push to main: an already-published version is skipped.
//
// It calls `npm publish` directly (not `changeset publish`, which uses `yarn npm publish` in a Yarn project)
// so npm trusted publishing (OIDC, with provenance) works without a stored npm token.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));

let published = false;
try {
    execSync(`npm view ${name}@${version} version`, { stdio: "pipe" });
    published = true;
} catch (error) {
    // E404 means this version (or the whole package) isn't on npm yet; anything else is a real failure.
    if (!/E404/.test(String(error.stderr))) throw error;
}

if (published) {
    console.log(`${name}@${version} is already on npm; nothing to publish.`);
    process.exit(0);
}

execSync("npm publish --provenance --access public", { stdio: "inherit" });
// Creates the git tag and prints "New tag:", which the Changesets action turns into a GitHub release.
execSync("yarn changeset tag", { stdio: "inherit" });
