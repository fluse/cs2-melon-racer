---
name: release
description: Cut a new Melon Racer release — bump the version, summarize the changes since the last release as a changelog, update STEAM.md (change notes EN/DE, description), write a MapCore channel update post from a template the user provides, and create a matching git tag. Use when the user says "release", "neues Release", "Version bumpen", "Update rausbringen" or invokes /release.
---

# Release

Cuts a Melon Racer release in this order. Stop and ask whenever a step
says so — don't guess past it.

Versions are semver, tags are `v<version>` (e.g. `v0.6.0`). The version
lives only in `package.json` (+ `package-lock.json`); the release history
lives in `CHANGELOG.md` and in git tags.

## 1. Preflight

1. `git status --short` and `git log -1 --oneline`.
   - Uncommitted changes (often `maps/melon_racer.vmap`, materials,
     `STEAM.md`): list them and ask the user whether they belong in this
     release (commit them first, as their own commit with a fitting message)
     or stay out (they're then not part of the tag). Never stash or discard
     them.
2. `npm test` and `npm run build`. A failing test stops the release: show
   the output and ask. If the build changed `maps/scripts/*.js`, those
   belong in the release — commit them with the source they came from.
3. Find the last release: `git describe --tags --abbrev=0 --match "v*"`.
   - **No tag yet**: the newest entry in `CHANGELOG.md` names the commit
     of the last release (`Commit <hash>.`) — use that as the base.
   - The **version** of that newest entry must equal `package.json`'s; if
     not, ask before bumping.

## 2. Collect the changes

Base = the last tag (or the commit from 1.3). Read:

- `git log <base>..HEAD --format='%h %s%n%b'`
- `git diff <base>..HEAD --stat`
- `git diff <base>..HEAD -- GAMEPLAY.md docs/` — GAMEPLAY.md describes
  every mechanic, so its diff is the most reliable list of what changed for
  players. Open the source diff only where a commit message is unclear.

Sort into **New / Changed / Fixed** and write every entry from the
**player's point of view** (what they see, feel or can do now). Leave out
what players never notice — refactors, folder moves, tests, docs, build
tooling — except in the separate *Mapping/Dev* section of the changelog
(Mapping API changes matter to people building tracks). Map-only commits
("map update") → ask the user what changed in the map, the diff of a binary
`.vmap` can't tell you.

Show the user the sorted list before writing anything and let them correct
it.

## 3. Bump the version

Current version: `package.json`. Propose (0.x semantics):

- **minor** (`0.5.0` → `0.6.0`) — anything under *New*, or gameplay that
  plays noticeably different;
- **patch** (`0.5.0` → `0.5.1`) — only fixes / small tuning.

Ask with AskUserQuestion (proposal first, marked "(Recommended)"; patch /
minor / major as options), plus a short **update name** for the headline
(e.g. "Wall jumps, water & a new HUD" — propose one from the biggest
change). Then:

```
npm version <x.y.z> --no-git-tag-version
```

(updates `package.json` and `package-lock.json`, no commit, no tag).

## 4. CHANGELOG.md

Prepend the new release under the intro of `CHANGELOG.md` at the repo
root (newest on top), in the same format as the entries already there:

```markdown
## [0.6.0] — 2026-10-03 — Wall jumps, water & a new HUD

Tag `v0.6.0`.

### New
- …
### Changed
- …
### Fixed
- …
### Mapping/Dev
- … (new script inputs, trigger names, tools — only if any)
```

Drop empty sections. Date = today (`YYYY-MM-DD`). New entries name their
tag (the release commit's hash isn't known yet); the untagged early
entries name their commit instead.

## 5. STEAM.md

Read all of `STEAM.md` first, then:

1. **Change notes:** under "## Change note — template", after the last
   existing note, add this release's notes in Steam **BBCode** (no
   Markdown!), English then German, same style as the existing ones:
   heading `[b]Update — <update name>[/b]` (DE: translated name), then a
   `[list]` of `[*]New: …` / `[*]Changed: …` / `[*]Fixed: …`
   (DE: `Neu:` / `Geändert:` / `Behoben:`). Introduce them with a line
   like "For the <name> update (v<version>):". Short, player's view —
   only the entries a player cares about, not the whole changelog.
2. **Descriptions (EN and DE):** if a new mechanic or control came in,
   add/adjust it in the *Features* list and *Controls* table of **both**
   languages; drop items from *Work in progress* that are now done. Keep
   the tone (short sentences, "you"/"du"). Each description must stay
   ≤ 8000 characters — count the content of each code block and report the
   two numbers.
3. Don't touch the title or the "Other page settings" section unless
   something there is now wrong.

## 6. MapCore update post

**Always ask the user for the template first** — they paste the post
template for the MapCore channel (e.g. the last post they made there). Do
not write the post until it's there, and don't invent a format.

Then fill that template exactly: keep its structure, formatting syntax
(Discord Markdown, BBCode, whatever it uses), emoji, links and sign-off;
replace only the release-specific parts (version, update name, date, list
of changes, screenshots placeholders). Content comes from the changelog,
told for mappers/players in the community — highlights first, at most
~8 bullets. If the template looks like Discord, stay under 2000
characters (say how many it has).

Give the finished post in the chat inside one code block, ready to copy.
Don't post it anywhere yourself.

## 7. Commit and tag

1. Show `git status --short` and `git diff --stat`, then commit the
   release files (`package.json`, `package-lock.json`, `CHANGELOG.md`,
   `STEAM.md`, `AGENTS.md` if touched — stage them by name, not `git add
   -A`):
   ```
   release v<version>: <update name>
   ```
2. Annotated tag on that commit, the changelog entry as the message:
   ```
   git tag -a --cleanup=verbatim v<version> -F <scratchpad file with "Melon Racer v<version> — <update name>" + blank line + the changelog entry>
   ```
3. **Ask before pushing.** On yes: `git push origin main` and
   `git push origin v<version>` (only this tag, not `--tags`).

## 8. Wrap-up

Report: old → new version, tag name, commit hash, pushed or not, the
character counts from 5.2/6. Remind the user of the steps only they can
do: upload the map in the Workshop tools, paste the change notes (EN, then
DE language) on the Workshop page, post the MapCore text.
