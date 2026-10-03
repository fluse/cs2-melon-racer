// Builds the Melon Racer GitHub Page: site/index.html + site/style.css (the
// hand-written page) -> site/dist/, filling in the version from package.json
// and the release history from CHANGELOG.md, and copying the images the page
// uses out of the addon (logo, gameplay gif, HUD icons) plus everything in
// site/images/. site/dist/ is gitignored — the GitHub Actions workflow
// (.github/workflows/pages.yml) runs this script and deploys the result.
//
// No dependencies on purpose: the changelog only uses a handful of Markdown
// constructs (## release, ### section, "- " items, `code`, **bold**,
// [links](…)), so a tiny renderer here beats pulling in a Markdown package.
//
// Usage: node site/build.mjs   (or npm run site) — then open site/dist/index.html

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(siteDir);
const distDir = path.join(siteDir, "dist");

const REPO_URL = "https://github.com/fluse/cs2-melon-racer";
/** Steam Workshop item page; the "Subscribe" button is left out while this is empty. */
const WORKSHOP_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3808250578";
const SERVER_ADDRESS = "tante.io:27015";

/** published path (under dist/) -> source path (under the repo root) */
const COPIED_IMAGES = {
    "images/logo.png": "panorama/images/custom_game/logo_melon_racer.png",
    "images/gameplay.gif": "docs/gifs/2026-09-29_21-24-54.gif",
    "images/track-start.png": "panorama/images/custom_game/icons/track-start.png",
    "images/track-finish.png": "panorama/images/custom_game/icons/track-finish.png",
};

/** @param {string} text */
function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Links in CHANGELOG.md are relative to the repo root; on the page they point at GitHub. */
function resolveLink(href) {
    return /^[a-z]+:|^#/.test(href) ? href : `${REPO_URL}/blob/main/${href.replace(/^\.\//, "")}`;
}

/** @param {string} text one line of Markdown -> inline HTML */
function renderInline(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${escapeHtml(resolveLink(href))}">${label}</a>`);
}

/**
 * @typedef {{ title: string, items: string[] }} ChangelogSection
 * @typedef {{ version: string, date: string, name: string, sections: ChangelogSection[] }} Release
 * @param {string} markdown CHANGELOG.md
 * @returns {Release[]} newest first, as in the file
 */
export function ParseChangelog(markdown) {
    /** @type {Release[]} */
    const releases = [];
    /** @type {string[] | null} */
    let items = null;
    for (const line of markdown.split(/\r?\n/)) {
        const release = line.match(/^## \[([^\]]+)\]\s*—\s*([^—]+?)\s*(?:—\s*(.+))?$/);
        if (release) {
            releases.push({ version: release[1], date: release[2], name: release[3] ?? "", sections: [] });
            items = null;
            continue;
        }
        const current = releases.at(-1);
        if (!current) continue; // the intro above the first release
        const section = line.match(/^### (.+)$/);
        if (section) {
            items = [];
            current.sections.push({ title: section[1].trim(), items });
            continue;
        }
        const item = line.match(/^- (.+)$/);
        if (item && items) items.push(item[1].trim());
        else if (/^\s+\S/.test(line) && items?.length) items[items.length - 1] += " " + line.trim();
        // anything else (blank lines, "Commit `…`." / "Tag `…`.") isn't shown
    }
    return releases;
}

/** @param {Release[]} releases */
function renderChangelog(releases) {
    return releases
        .map((release, i) => {
            const sections = release.sections
                .map((s) => {
                    const dev = /mapping|dev/i.test(s.title);
                    return `<section class="cl-section${dev ? " cl-dev" : ""}">
            <h4>${renderInline(s.title)}</h4>
            <ul>${s.items.map((item) => `\n              <li>${renderInline(item)}</li>`).join("")}
            </ul>
          </section>`;
                })
                .join("\n          ");
            return `<details class="release"${i === 0 ? " open" : ""}>
        <summary>
          <span class="release-version">v${escapeHtml(release.version)}</span>
          <span class="release-name">${renderInline(release.name)}</span>
          <time datetime="${escapeHtml(release.date)}">${escapeHtml(release.date)}</time>
        </summary>
        <div class="release-body">
          ${sections}
        </div>
      </details>`;
        })
        .join("\n      ");
}

function build() {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
    const releases = ParseChangelog(readFileSync(path.join(rootDir, "CHANGELOG.md"), "utf8"));
    const latest = releases[0];

    const workshopButton = WORKSHOP_URL
        ? `<a class="button button-primary" href="${escapeHtml(WORKSHOP_URL)}">Subscribe on the Workshop</a>`
        : "";

    /** @type {Record<string, string>} */
    const values = {
        VERSION: escapeHtml(pkg.version),
        LATEST_NAME: latest ? renderInline(latest.name) : "",
        LATEST_DATE: latest ? escapeHtml(latest.date) : "",
        REPO_URL,
        SERVER_ADDRESS: escapeHtml(SERVER_ADDRESS),
        WORKSHOP_BUTTON: workshopButton,
        CHANGELOG: renderChangelog(releases),
        YEAR: String(new Date().getFullYear()),
    };

    const template = readFileSync(path.join(siteDir, "index.html"), "utf8");
    const html = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (!(key in values)) throw new Error(`site/index.html: unknown placeholder ${match}`);
        return values[key];
    });

    rmSync(distDir, { recursive: true, force: true });
    mkdirSync(path.join(distDir, "images"), { recursive: true });
    writeFileSync(path.join(distDir, "index.html"), html);
    cpSync(path.join(siteDir, "style.css"), path.join(distDir, "style.css"));
    cpSync(path.join(siteDir, "favicon.svg"), path.join(distDir, "favicon.svg"));
    for (const [to, from] of Object.entries(COPIED_IMAGES)) cpSync(path.join(rootDir, from), path.join(distDir, to));
    const ownImages = path.join(siteDir, "images");
    if (existsSync(ownImages)) cpSync(ownImages, path.join(distDir, "images"), { recursive: true });
    writeFileSync(path.join(distDir, ".nojekyll"), ""); // serve the files as they are, no Jekyll pass

    console.log(`site: built v${pkg.version} with ${releases.length} releases -> ${path.relative(rootDir, distDir)}/ (${readdirSync(distDir).length} entries)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
