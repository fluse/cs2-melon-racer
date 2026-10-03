---
name: gif
description: Turn the latest OBS recording (or a named one) into gameplay GIFs for Melon Racer — a full-quality GIF for the GitHub Page's gameplay slider plus a copy under 2 MB for the Steam Workshop — and add the full one to the slider in site/build.mjs. Use when the user says "gif", "aufnahme in gif umwandeln", "OBS-Aufnahme als GIF" or invokes /gif.
---

# Gameplay GIF

Every recording becomes **two GIFs** in `docs/gifs/`, and the full one goes
onto the GitHub Page's gameplay slider. Nothing is committed (that's `/commit`).

| File | For | Settings |
|---|---|---|
| `docs/gifs/<stamp>.gif` | GitHub Page slider | 480 px wide, 12 fps, full palette |
| `docs/gifs/<stamp>_steam.gif` | Steam Workshop upload | **under 2 MB** (2 000 000 bytes) — the Workshop's limit |

`<stamp>` is the recording's OBS name with `_` for the space:
`2026-10-03 14-01-55.mkv` → `2026-10-03_14-01-55`.

## 1. Find the recording and ffmpeg

- OBS's recording folder is the `FilePath=` line in
  `%APPDATA%\obs-studio\basic\profiles\*\basic.ini` (currently
  `C:\Users\nZero\Videos\OBS`). Take the **newest** `.mkv`/`.mp4` there,
  unless the user named another (or "die letzten zwei" → one run per file).
  Skip one that's still being written (modified seconds ago and growing).
- ffmpeg: `ffmpeg` on PATH, else the winget copy
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*-full_build\bin\ffmpeg.exe`
  (ffprobe next to it). Neither → tell the user (`winget install Gyan.FFmpeg`).
- `ffprobe` the duration. If the user asked for a trim (`-ss`/`-t`), apply
  it to **both** GIFs.

## 2. Full-quality GIF

```
ffmpeg -y -v error -i "<recording>" -vf "fps=12,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" -loop 0 "docs/gifs/<stamp>.gif"
```

## 3. Steam GIF under 2 MB

Try settings in the scratchpad from best to smallest and keep the **first**
one under 2 000 000 bytes (run them in one shell call, print each size):

| width | fps | colors |
|---|---|---|
| 480 | 12 | 128 |
| 400 | 10 | 128 |
| 360 | 10 | 96 |
| 360 | 8 | 64 |
| 320 | 8 | 64 |
| 280 | 8 | 48 |

```
ffmpeg -y -v error -i "<recording>" -vf "fps=<fps>,scale=<width>:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=<colors>:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 "<scratchpad>/t_<width>_<fps>_<colors>.gif"
```

Copy the winner to `docs/gifs/<stamp>_steam.gif`, delete the test files.
For reference: a 16 s clip fit at 360 px / 8 fps / 64 colors (1.89 MB). If
even the last row is too big, the clip is too long — ask the user whether to
trim it rather than going smaller still.

## 4. Look at the clip

Tile a few frames into one image and read it, to know what the clip shows:

```
ffmpeg -y -v error -i "<recording>" -vf "fps=1/<duration÷4>,scale=640:-2,tile=2x2" -frames:v 1 "<scratchpad>/frames.png"
```

## 5. Add it to the slider

In `site/build.mjs`, add an entry to **`GAMEPLAY_GIFS`** — new clips go
**first** (the slider shows them in list order, newest first):

```js
{
    source: "docs/gifs/<stamp>.gif",
    alt: "<what's visible, for screen readers>",
    caption: "<one short sentence shown under the clip>",
},
```

- Always the full-quality file, never `_steam.gif`.
- `alt` and `caption` in **English** (the whole page is English), in the
  style of the existing entries, describing only what the frames really show
  (water, ramps, heal gate, wall bounce, checkpoint gate, …).
- The build copies each entry to `images/gameplay-<n>.gif`; nothing else in
  `site/index.html` or `site/style.css` needs touching.

## 6. Check

1. `npm run site` and `node --test test/site/*.test.mjs` (every link and
   `#gameplay-<n>` anchor must resolve).
2. Screenshot `site/dist/index.html` with headless Chrome
   (`C:\Program Files\Google\Chrome\Application\chrome.exe --headless=new
   --disable-gpu --hide-scrollbars --user-data-dir=<scratchpad>\chrome
   --virtual-time-budget=4000 --window-size=1280,1400
   --screenshot=<scratchpad>\shot.png "file:///…/index.html"`, spaces in
   the path as `%20`) and look at it: slider, arrows, dots, caption.

## 7. Report (German, like the user writes)

- Paths and sizes of both GIFs, and the settings the Steam one ended up with.
- The caption you wrote — ask the user to check it, it's guessed from frames.
- That nothing is committed yet (`/commit` when they're happy).
