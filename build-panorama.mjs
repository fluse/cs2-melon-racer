// Assembles the Panorama HUD layouts out of src/panorama/<layout>/ into the
// single .xml file the custom_hud_layout entity references
// (panorama/layout/custom_game/<layout>.xml). Panorama has no includes for
// layout parts of its own (its <include> in <styles> only pulls in CSS), so
// the parts are put together here, with PostHTML in XML mode:
//
// - posthtml-modules: <module href="part.xml" /> is replaced by that file,
//   relative to the file it's in (parts can hold modules of their own).
//   Its other attributes are values in it: a component
//   (src/panorama/components/) is used as
//   <module href="../components/toggle.xml" id="…" name="…" />, and a
//   <content /> in it takes what's written between <module> and </module>.
//   Not posthtml-include: its tag is "include", which Panorama's own
//   <include src="…css"> in <styles> would collide with.
// - posthtml-expressions: {{ … }}, <each loop="…">, <if condition="…"> in any
//   file, with the layout's locals (src/panorama/<layout>/locals.mjs: lists
//   and counts from the script's constants) and a module's attributes.
//
// The result is laid out by nesting depth (Layout), so parts and components
// can be written at column 0 and used at any depth. PostHTML writes empty
// elements as <X></X> — they're turned back into <X />, the way the rest of
// the layout is written.
//
// A changed layout is compiled for the game right away (resourcecompiler),
// since Panorama files aren't recompiled on save.
//
// Usage: imported by build.mjs (npm run build / watch) and by
// test/map/hud-layout-build.test.mjs, which checks the output is current.

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import posthtml from "posthtml";
import modules from "posthtml-modules";
import expressions from "posthtml-expressions";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const panoramaDir = path.join(rootDir, "src", "panorama");

/** Every HUD layout: its folder in src/panorama/ (main file <name>.xml, optional locals.mjs). Add new ones here. */
export const layouts = ["melon_racer"];

/** @param {string} name */
export function LayoutOutputPath(name) {
    return path.join(rootDir, "panorama", "layout", "custom_game", `${name}.xml`);
}

const parseOptions = { xmlMode: true, recognizeSelfClosing: true };

// A {{ name }} without a value is left in the text (missingLocal) instead of
// throwing: posthtml-expressions fills in the inside of an <if> before it
// decides it, so a component's optional attribute (<if condition="typeof
// pill === 'string'">…{{ pill }}…</if>) would throw where it's left out.
// One left over in the finished layout is an error (BuildLayout).
const EXPRESSIONS = { strictMode: true, missingLocal: "{local}" };

/** Line breaks are handled as \n throughout; the files may come with \r\n. @param {string} text */
const Lf = text => text.replace(/\r\n/g, "\n");

/** @param {any} node */
const IsBlank = node => typeof node === "string" && /^\s*$/.test(node);

/**
 * Line breaks in whitespace, as written: a blank line in a file is an empty
 * one ("\n\n"); "\n\t\n\t\t" is two files' (or an <if>'s and its content's)
 * whitespace run together, one line break.
 * @param {string} text
 */
const Breaks = text => (text.includes("\n") ? 1 + (Lf(text).match(/\n(?=\n)/g) ?? []).length : 0);

/**
 * The nodes with what <module>/<each>/<if> left behind opened up: nodes
 * without a tag, and arrays (a <content /> slot is replaced by one).
 * @param {any[]} nodes @returns {any[]}
 */
function Flatten(nodes) {
    return nodes.flatMap(node => {
        if (Array.isArray(node)) return Flatten(node);
        if (node && typeof node === "object" && !node.tag) return Flatten(node.content ?? []);
        return [node];
    });
}

/**
 * Lays the finished tree out by nesting depth, whatever indent a part or
 * component was written at: every line break between elements is followed
 * by one tab per level, and a comment's further lines too (their own leading
 * tabs replaced, the spaces lining them up kept). Whitespace that meets from
 * different files (a part's last line break, the one after its <module>)
 * counts once — the larger number of line breaks, at most one blank line.
 * Whitespace without a line break (between elements on one line) stays.
 * An attribute left empty is dropped: that's how a component leaves out an
 * optional one (id="{{ typeof id === 'string' ? id : '' }}").
 * @param {any[]} nodes
 * @param {number} depth
 * @returns {any[]}
 */
function Layout(nodes, depth) {
    /** @type {any[]} */
    const flat = [];
    for (const node of Flatten(nodes)) {
        const last = flat[flat.length - 1];
        if (IsBlank(node) && IsBlank(last)) flat[flat.length - 1] = Breaks(last) >= Breaks(node) ? last : node;
        else flat.push(node);
    }
    return flat.map((node, i) => {
        if (typeof node !== "string") {
            for (const [key, value] of Object.entries(node.attrs ?? {})) {
                if (value === "") delete node.attrs[key];
            }
            if (Array.isArray(node.content)) node.content = Layout(node.content, depth + 1);
            return node;
        }
        const tabs = "\t".repeat(depth);
        if (!IsBlank(node)) return node.replace(/\n\t*/g, `\n${tabs}`);
        if (!node.includes("\n")) return node;
        const closing = i === flat.length - 1 ? "\t".repeat(Math.max(depth - 1, 0)) : tabs;
        return "\n".repeat(Math.min(Breaks(node), 2)) + closing;
    });
}

const componentsDir = path.join(panoramaDir, "components");

/**
 * A plugin for every file a <module> pulls in: the whitespace before its
 * first and after its last element goes (the <module> tag's own surroundings
 * place it), and a component's comments (what it is, its attributes) are
 * dropped, or they'd be repeated wherever it's used. Parts keep theirs.
 * @param {string} from the file's path
 */
function ModulePlugins(from) {
    const component = path.resolve(from).startsWith(componentsDir + path.sep);
    return [(/** @type {any} */ tree) => {
        /** @type {any[]} */
        const nodes = Array.from(tree).filter(node => !(component && typeof node === "string" && node.trimStart().startsWith("<!--")));
        while (IsBlank(nodes[0])) nodes.shift();
        while (IsBlank(nodes[nodes.length - 1])) nodes.pop();
        tree.length = 0;
        tree.push(...nodes);
        return tree;
    }];
}

/**
 * The layout's values for {{ }}, <each>, <if>: its locals.mjs's default
 * export, if it has one.
 * @param {string} name
 * @returns {Promise<Record<string, unknown>>}
 */
async function LayoutLocals(name) {
    const file = path.join(panoramaDir, name, "locals.mjs");
    if (!fs.existsSync(file)) return {};
    return (await import(pathToFileURL(file).href)).default;
}

/**
 * The finished layout's text (\n line breaks), from its main file.
 * @param {string} name
 */
export async function BuildLayout(name) {
    const main = path.join(panoramaDir, name, `${name}.xml`);
    const locals = await LayoutLocals(name);
    const result = await posthtml([
        expressions({ locals, ...EXPRESSIONS }),
        modules({
            from: main,
            root: path.dirname(main),
            tag: "module",
            attribute: "href",
            attributeAsLocals: true,
            locals,
            expressions: EXPRESSIONS,
            parser: parseOptions,
            plugins: ModulePlugins,
        }),
        (/** @type {any} */ tree) => {
            const laidOut = Layout(Array.from(tree), 0);
            tree.length = 0;
            tree.push(...laidOut);
            return tree;
        },
    ]).process(Lf(fs.readFileSync(main, "utf8")), parseOptions);
    const html = Lf(result.html).replace(/<([A-Za-z]+)((?:\s[^<>]*)?)><\/\1>/g, "<$1$2 />");
    const unknown = [...new Set(html.match(/\{\{.*?\}\}/g) ?? [])];
    if (unknown.length > 0) throw new Error(`${name}.xml: no value for ${unknown.join(", ")} — a typo, or an attribute missing where the component is used`);
    return html.replace(/^<root>\n/,
        `<root>\n\t<!-- AUTO-GENERATED by \`npm run build\` from src/panorama/${name}/ — do not edit directly. -->\n`);
}

const resourceCompiler = path.join(rootDir, "..", "..", "..", "game", "bin", "win64", "resourcecompiler.exe");

/**
 * Compiles a built layout for the game (.vxml_c): Panorama files aren't
 * recompiled on save. Skipped without CS2's resourcecompiler next to the addon.
 * @param {string} name
 */
export function CompileLayout(name) {
    if (!fs.existsSync(resourceCompiler)) {
        console.log(`resourcecompiler.exe not found, compile ${name}.xml by hand`);
        return;
    }
    const result = spawnSync(resourceCompiler,
        ["-game", "csgo", "-addon", "melon_racer", "-f", "-i", LayoutOutputPath(name)],
        { cwd: path.dirname(resourceCompiler), encoding: "utf8" });
    const ok = result.status === 0;
    console.log(ok ? `compiled ${name}.xml for the game` : `compiling ${name}.xml failed:\n${result.stdout}${result.stderr}`);
}

/**
 * Builds every layout, compiling the ones whose file changed.
 */
export async function BuildAllLayouts() {
    for (const name of layouts) {
        const out = LayoutOutputPath(name);
        const html = await BuildLayout(name);
        const old = fs.existsSync(out) ? Lf(fs.readFileSync(out, "utf8")) : null;
        console.log(`built panorama/layout/custom_game/${name}.xml${html === old ? " (unchanged)" : ""}`);
        if (html !== old) {
            fs.writeFileSync(out, html);
            CompileLayout(name);
        }
    }
}

/** Rebuilds the layouts whenever a file under src/panorama/ changes. */
export function WatchLayouts() {
    /** @type {NodeJS.Timeout | undefined} */
    let timer;
    fs.watch(panoramaDir, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => BuildAllLayouts().catch(error => console.error(error)), 100);
    });
    console.log("posthtml: watching src/panorama/ for changes");
}
