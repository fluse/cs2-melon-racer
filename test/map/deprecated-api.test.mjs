// No script calls an Instance method Valve has deprecated (moved to Console
// or GameRules, renamed, or about to go): they still work for now, but "will
// be removed in a future update". The list comes from point_script.d.ts
// itself, so copying Valve's newer d.ts over (AGENTS.md) is enough for this
// to catch the next round of moves. Deprecated *overloads* (positional
// DebugLine(...) etc.) share their name with the current form and aren't
// checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Names of IPointScript's methods marked "@deprecated This method will be removed". */
function DeprecatedInstanceMethods() {
    const dts = readFileSync(join(root, "maps/scripts/point_script.d.ts"), "utf8");
    const body = dts.slice(dts.indexOf("interface IPointScript"));
    const names = [...body.slice(0, body.indexOf("\n    }")).matchAll(/@deprecated This method will be removed[^\n]*\n\s*(\w+)\(/g)].map((m) => m[1]);
    return [...new Set(names)];
}

function* Walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* Walk(path);
        else if (entry.name.endsWith(".js")) yield path;
    }
}

test("point_script.d.ts: the deprecated Instance methods are found", () => {
    assert.ok(DeprecatedInstanceMethods().includes("Msg"), "the d.ts's @deprecated comments changed shape - update DeprecatedInstanceMethods");
});

test("src: no deprecated Instance method is called", () => {
    const deprecated = new RegExp(`\\bInstance\\.(${DeprecatedInstanceMethods().join("|")})\\(`, "g");
    const bad = [];
    for (const path of Walk(join(root, "src"))) {
        readFileSync(path, "utf8").split("\n").forEach((line, i) => {
            for (const m of line.matchAll(deprecated)) {
                bad.push(`${path.slice(root.length).replaceAll("\\", "/")}:${i + 1} Instance.${m[1]}`);
            }
        });
    }
    assert.deepEqual(bad, [], `deprecated - use Console (Log, ServerCommand, SetConvar, ...) or GameRules instead, see point_script.d.ts:\n${bad.join("\n")}`);
});
