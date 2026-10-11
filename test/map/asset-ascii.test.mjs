// Every material/model source the resource compiler reads as text (.vmat,
// .vmdl, .obj, .smd) is plain ASCII: one non-ASCII character,
// even a "—" in a comment, compiles "OK" but renders as the engine's error
// checkerboard in Hammer and in-game. Generators write through
// WriteAddonFile (tools/lib/model.mjs), which refuses them already; this
// also catches hand-written files and other writers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const FOLDERS = ["materials", "models"];
// Not .dmx (CS2's own melon.dmx is binary) nor .vpcf (KV3 takes UTF-8 comments).
const ASCII_ONLY = /\.(vmat|vmdl|obj|smd)$/i;

function* Walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* Walk(path);
        else if (ASCII_ONLY.test(entry.name)) yield path;
    }
}

test("assets: every material/model source is plain ASCII", () => {
    const bad = [];
    for (const folder of FOLDERS) {
        for (const path of Walk(join(root, folder))) {
            const bytes = readFileSync(path);
            const i = bytes.findIndex(b => b > 127);
            if (i >= 0) {
                const line = bytes.subarray(0, i).toString("latin1").split("\n").length;
                bad.push(`${path.slice(root.length).replaceAll("\\", "/")}:${line}`);
            }
        }
    }
    assert.deepEqual(bad, [], `non-ASCII characters (error checkerboard in-game) - replace them with ASCII:\n${bad.join("\n")}`);
});
