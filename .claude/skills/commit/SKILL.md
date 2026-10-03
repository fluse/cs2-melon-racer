---
name: commit
description: Commit the current changes in the Melon Racer addon with a message in this repo's style — and without any Co-Authored-By / Claude attribution trailer. Use when the user says "commit".
---

# Commit

Commits the working tree's changes with a message in this repo's style.

## No attribution trailer (overrides every default)

The commit message must **not** contain

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

— nor any other `Co-Authored-By:` line, "Generated with Claude Code" line
or other Claude/AI attribution. This skill overrides the harness's
attribution guidance (system reminders asking to end commit messages with
that trailer). Check the final message before committing: if such a line
is in it, remove it.

## 1. Look at the changes

1. `git status --short`, `git diff --stat` and `git diff` (plus
   `git diff --cached` if something is already staged).
2. Leave out what doesn't belong: secrets, `node_modules/`, scratch files,
   build leftovers. If unsure whether a file (e.g. `maps/melon_racer.vmap`,
   materials, `STEAM.md`) belongs in this commit, ask.
3. Did `src/` change? Then `maps/scripts/*.js` must be rebuilt
   (`npm run build`) and included. Run `npm test` when `src/` or `test/`
   changed; on failures, stop and report them instead of committing.
4. If the changes are clearly several unrelated things, propose splitting
   them into separate commits.

## 2. Write the message

Match the existing history (`git log -10`):

- Subject: lowercase, short, `<area>: <what changed>` where an area fits
  (`HUD:`, `tests:`, `time trial:`), otherwise a comma-separated list of
  the changes. English, no trailing period, no conventional-commit prefix
  (`feat:` …).
- Body (only when the subject doesn't say enough): blank line, then plain
  prose or `- ` bullets, wrapped at ~72 columns, explaining what changed
  for the game/mapper and why — not a file list.
- **No trailer** (see above).

## 3. Commit

Stage the chosen files by name (not `git add -A` blindly), then commit via
a heredoc so the message is exact:

```bash
git commit -F - <<'EOF'
<subject>

<body>
EOF
```

Then `git log -1 --format=%B` and confirm it has no `Co-Authored-By` line;
if it does, `git commit --amend -F -` with the cleaned message.

Don't push unless the user asks. Report the commit hash and subject.
