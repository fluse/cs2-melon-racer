// The GitHub Page renders CHANGELOG.md with site/build.mjs's own small parser:
// check it reads every release of the real file and the format it relies on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ParseChangelog } from "../../site/build.mjs";

test("every release in CHANGELOG.md parses, newest matching package.json", () => {
    const changelog = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const releases = ParseChangelog(changelog);
    const headings = changelog.match(/^## \[/gm) ?? [];
    assert.equal(releases.length, headings.length);
    assert.equal(releases[0].version, pkg.version);
    for (const release of releases) {
        assert.match(release.date, /^\d{4}-\d{2}-\d{2}$/, `v${release.version}: date`);
        assert.ok(release.sections.length > 0, `v${release.version}: has sections`);
        for (const section of release.sections) assert.ok(section.items.length > 0, `v${release.version} ${section.title}: has items`);
    }
});

test("ParseChangelog joins wrapped items and skips the commit/tag line", () => {
    const releases = ParseChangelog(
        "# Changelog\n\nIntro.\n\n## [1.2.0] — 2026-01-02 — Big one\n\nTag `v1.2.0`.\n\n### New\n- First\n  continued.\n- Second\n\n### Fixed\n- Third\n",
    );
    assert.deepEqual(releases, [
        {
            version: "1.2.0",
            date: "2026-01-02",
            name: "Big one",
            sections: [
                { title: "New", items: ["First continued.", "Second"] },
                { title: "Fixed", items: ["Third"] },
            ],
        },
    ]);
});
