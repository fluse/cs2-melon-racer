// Keeps the Mapping API (docs/mapping-api/) in step with the script: every
// entity name the script looks up (the *_NAME exports in constants/) and every
// script input it registers must be documented there, so a new Hammer-side
// convention can't be added without the mapping reference hearing about it.
// Also checks the pages themselves: every link between them (and its #anchor)
// resolves, and every value a table gives for a constant is its real value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as constants from "../../src/melon_drive/constants/index.js";

const DOC_DIR = new URL("../../docs/mapping-api/", import.meta.url);
const pages = Object.fromEntries(
    readdirSync(DOC_DIR)
        .filter((file) => file.endsWith(".md"))
        .map((file) => [file, readFileSync(new URL(file, DOC_DIR), "utf8")]),
);
const doc = Object.values(pages).join("\n");

// Same list as KNOWN_INPUT in map-io.test.mjs, in the form the doc writes them.
const SCRIPT_INPUTS = [
    "start_<trackId>",
    "checkpoint_<trackId>_<index>",
    "finish_<trackId>",
    "hub_enter",
    "hub_leave",
    "hub_teleport",
    "melon_paint",
    "melon_teleport",
    "melon_break",
    "heal_enter",
    "heal_leave",
    "lift_enter",
    "lift_leave",
    "camera_enter",
    "camera_leave",
    "jump_pad_enter",
    "jump_pad_leave",
    "water_enter",
    "water_leave",
];

test("every entity name the script looks up is in the Mapping API", () => {
    const missing = Object.entries(constants)
        .filter(([key, value]) => key.endsWith("_NAME") && typeof value === "string")
        .filter(([, value]) => !doc.includes(`\`${value}\``))
        .map(([key, value]) => `${key} = "${value}"`);
    assert.deepEqual(missing, []);
});

test("every name pattern the script parses is in the Mapping API", () => {
    const missing = Object.entries(constants)
        .filter(([key, value]) => key.endsWith("_NAME_PATTERN") && value instanceof RegExp)
        .filter(([, value]) => !doc.includes(value.source))
        .map(([key, value]) => `${key} = ${value}`);
    assert.deepEqual(missing, []);
});

test("every script input is in the Mapping API index and on a page", () => {
    const index = pages["README.md"];
    assert.deepEqual(SCRIPT_INPUTS.filter((name) => !index.includes(`\`${name}\``)), []);
    const pagesOnly = Object.entries(pages).filter(([file]) => file !== "README.md").map(([, text]) => text).join("\n");
    assert.deepEqual(SCRIPT_INPUTS.filter((name) => !pagesOnly.includes(`\`${name}\``)), []);
});

// GitHub's heading anchors: lower case, punctuation dropped, spaces to "-".
function Slug(heading) {
    return heading
        .trim()
        .toLowerCase()
        .replace(/[`*_]/g, "")
        .replace(/[^\p{L}\p{N} -]/gu, "")
        .replace(/ /g, "-");
}

function Anchors(text) {
    const outsideCode = text.replace(/^```[\s\S]*?^```/gm, "");
    return new Set([...outsideCode.matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => Slug(heading)));
}

// The Mapping API pages, plus the track guide next to them in docs/.
const LINKED_DOCS = [
    ...Object.entries(pages).map(([file, text]) => ({ file, base: new URL(file, DOC_DIR), text })),
    { file: "../TRACK_CREATION.md", base: new URL("../TRACK_CREATION.md", DOC_DIR), text: readFileSync(new URL("../TRACK_CREATION.md", DOC_DIR), "utf8") },
];

test("every link in the Mapping API and the track guide resolves, anchors included", () => {
    const broken = [];
    for (const { file, base, text } of LINKED_DOCS) {
        for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
            if (/^[a-z]+:/.test(target)) continue;
            const [path, anchor] = target.split("#");
            const url = new URL(path || base, base);
            if (!existsSync(url)) {
                broken.push(`${file}: ${target} (no such file)`);
                continue;
            }
            if (anchor && url.pathname.endsWith(".md") && !Anchors(readFileSync(url, "utf8")).has(anchor)) {
                broken.push(`${file}: ${target} (no such heading)`);
            }
        }
    }
    assert.deepEqual(broken, []);
});

// A table row "| `CONSTANT` | … | `<file>.js` |" names the file it's defined
// in (relative to src/melon_drive/) — it must really be exported there, so
// moving a constant can't leave the table pointing at the old file.
test("every 'Defined in' file in a Mapping API table exports its constant", () => {
    const wrong = [];
    for (const [file, text] of Object.entries(pages)) {
        for (const [, key, source] of text.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|.*\| `([\w./-]+\.js)` \|$/gm)) {
            const url = new URL(`../../src/melon_drive/${source}`, import.meta.url);
            const exported = existsSync(url) && new RegExp(`^export const ${key}\\b`, "m").test(readFileSync(url, "utf8"));
            if (!exported) wrong.push(`${file}: ${key} isn't exported by ${source}`);
        }
    }
    assert.deepEqual(wrong, []);
});

// A table row "| `CONSTANT` | <value> | …" must give the constant's real value
// (units and a leading "×" are ignored), so retuning one shows up here.
test("every constant value in a Mapping API table is current", () => {
    const stale = [];
    for (const [file, text] of Object.entries(pages)) {
        for (const [, key, cell] of text.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \| ([^|]+) \|/gm)) {
            if (!(key in constants)) {
                stale.push(`${file}: ${key} isn't an exported constant`);
                continue;
            }
            const actual = constants[key];
            const written = cell.trim();
            let documented;
            if (typeof actual === "number") documented = Number(written.match(/^×?(-?\d+(?:\.\d+)?)/)?.[1]);
            else if (typeof actual === "boolean") documented = written.replace(/`/g, "") === String(actual) ? actual : written;
            else if (typeof actual === "string") documented = written.replace(/`/g, "").replace(/^"|"$/g, "");
            else continue;
            if (documented !== actual) stale.push(`${file}: ${key} = ${JSON.stringify(actual)}, table says "${written}"`);
        }
    }
    assert.deepEqual(stale, []);
});
