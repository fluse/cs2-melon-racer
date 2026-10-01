// Checks the folder conventions of src/melon_drive/ (see AGENTS.md): the pure
// files — every constants.js, logic.js and *-logic.js, plus the
// constants/index.js barrel — never import the engine, directly or through
// another file, so Node (and these tests) can always load them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("../../src/melon_drive/", import.meta.url));
const files = readdirSync(srcDir, { recursive: true })
    .filter((f) => f.endsWith(".js"))
    .map((f) => f.split(path.sep).join("/"));

/** @param {string} file */
const isPure = (file) => /(^|\/)(constants|logic|[\w-]+-logic)\.js$/.test(file) || file === "constants/index.js";

/** @param {string} file @returns {string[]} the import specifiers in it */
function importsOf(file) {
    const source = readFileSync(path.join(srcDir, file), "utf8");
    return [...source.matchAll(/^\s*(?:import|export)\b[^"';]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

test("pure files (constants.js, logic.js, *-logic.js) only import other pure files", () => {
    const pure = files.filter(isPure);
    assert.ok(pure.length > 20, "sanity: found the pure files");
    const problems = [];
    for (const file of pure) {
        for (const spec of importsOf(file)) {
            if (!spec.startsWith(".")) {
                problems.push(`${file} imports "${spec}"`);
                continue;
            }
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
            if (!isPure(target)) {
                problems.push(`${file} imports engine-side ${target}`);
            }
        }
    }
    assert.deepEqual(problems, []);
});

test("no file is left loose in src/melon_drive/ besides index.js", () => {
    assert.deepEqual(files.filter((f) => !f.includes("/")), ["index.js"]);
});
