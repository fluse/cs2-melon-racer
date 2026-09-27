// Keeps MAPPING_API.md in step with the script: every entity name the
// script looks up (the *_NAME exports in constants/) and every script input it
// registers must be documented there, so a new Hammer-side convention can't
// be added without the mapping reference hearing about it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as constants from "../src/melon_drive/constants/index.js";

const doc = readFileSync(new URL("../MAPPING_API.md", import.meta.url), "utf8");

// Same list as KNOWN_INPUT in map-io.test.mjs, in the form the doc writes them.
const SCRIPT_INPUTS = [
    "checkpoint_<trackId>_<index>",
    "finish_<trackId>",
    "hub_enter",
    "hub_leave",
    "hub_teleport",
    "melon_paint",
    "melon_teleport",
    "heal_enter",
    "heal_leave",
];

test("every entity name the script looks up is in MAPPING_API.md", () => {
    const missing = Object.entries(constants)
        .filter(([key, value]) => key.endsWith("_NAME") && typeof value === "string")
        .filter(([, value]) => !doc.includes(`\`${value}\``))
        .map(([key, value]) => `${key} = "${value}"`);
    assert.deepEqual(missing, []);
});

test("every name pattern the script parses is in MAPPING_API.md", () => {
    const missing = Object.entries(constants)
        .filter(([key, value]) => key.endsWith("_NAME_PATTERN") && value instanceof RegExp)
        .filter(([, value]) => !doc.includes(value.source))
        .map(([key, value]) => `${key} = ${value}`);
    assert.deepEqual(missing, []);
});

test("every script input is in MAPPING_API.md", () => {
    assert.deepEqual(SCRIPT_INPUTS.filter((name) => !doc.includes(`\`${name}\``)), []);
});
