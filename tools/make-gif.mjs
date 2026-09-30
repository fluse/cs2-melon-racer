// Turns a recorded video (OBS .mkv/.mp4, ...) into an animated GIF for the
// Steam Workshop page / README — `node tools/make-gif.mjs [video] [options]`.
// Needs ffmpeg (`winget install Gyan.FFmpeg`); no npm dependencies.
//
// Without a video argument it takes the newest recording in ~/Videos/OBS.
// Two passes in one ffmpeg call: palettegen builds a palette from the clip's
// own colors, paletteuse maps the frames onto it — far better than ffmpeg's
// default 256-color web palette, at a smaller file size.
//
// Options (all optional):
//   --start <s>     start time in seconds (default 0)
//   --duration <s>  clip length in seconds (default 6; GIFs get big fast)
//   --width <px>    output width, height follows the aspect ratio (default 640)
//   --fps <n>       frames per second (default 15)
//   --colors <n>    palette size, 2..256 (default 128)
//   --out <path>    output file (default docs/gifs/<video name>.gif)
//
// Too big? Lower --fps (12), --width (480) or --colors (64), or cut shorter.
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ADDON_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = join(ADDON_DIR, "docs", "gifs");
const RECORDINGS_DIR = join(homedir(), "Videos", "OBS");
const VIDEO_EXTENSIONS = [".mkv", ".mp4", ".mov", ".webm", ".avi"];
// Warn above this — large GIFs load slowly on the Workshop page.
const WARN_SIZE_MB = 5;

const DEFAULTS = { start: 0, duration: 6, width: 640, fps: 15, colors: 128, out: null };

function ParseArgs(argv) {
    const options = { ...DEFAULTS, input: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            if (!(key in DEFAULTS)) throw new Error(`unknown option ${arg}`);
            const value = argv[++i];
            if (value === undefined) throw new Error(`${arg} needs a value`);
            options[key] = key === "out" ? value : Number(value);
            if (key !== "out" && !Number.isFinite(options[key])) throw new Error(`${arg}: not a number: ${value}`);
        } else if (options.input === null) {
            options.input = arg;
        } else {
            throw new Error(`unexpected argument ${arg}`);
        }
    }
    options.colors = Math.min(256, Math.max(2, Math.round(options.colors)));
    return options;
}

function NewestRecording() {
    if (!existsSync(RECORDINGS_DIR)) return null;
    const videos = readdirSync(RECORDINGS_DIR)
        .filter((name) => VIDEO_EXTENSIONS.includes(extname(name).toLowerCase()))
        .map((name) => join(RECORDINGS_DIR, name))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return videos[0] ?? null;
}

// ffmpeg on PATH, or where winget puts it (PATH only updates in new shells).
function FindFfmpeg() {
    try {
        execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
        return "ffmpeg";
    } catch {}
    const wingetLink = join(homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "ffmpeg.exe");
    if (existsSync(wingetLink)) return wingetLink;
    const packagesDir = join(homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages");
    if (existsSync(packagesDir)) {
        for (const pkg of readdirSync(packagesDir).filter((name) => name.startsWith("Gyan.FFmpeg"))) {
            for (const build of readdirSync(join(packagesDir, pkg))) {
                const exe = join(packagesDir, pkg, build, "bin", "ffmpeg.exe");
                if (existsSync(exe)) return exe;
            }
        }
    }
    return null;
}

function Main() {
    const options = ParseArgs(process.argv.slice(2));
    const input = options.input ? resolve(options.input) : NewestRecording();
    if (!input) throw new Error(`no video given and none found in ${RECORDINGS_DIR}`);
    if (!existsSync(input)) throw new Error(`video not found: ${input}`);

    const ffmpeg = FindFfmpeg();
    if (!ffmpeg) throw new Error("ffmpeg not found — install it with `winget install Gyan.FFmpeg`");

    const out = options.out
        ? resolve(options.out)
        : join(DEFAULT_OUT_DIR, basename(input, extname(input)).replace(/\s+/g, "_") + ".gif");
    mkdirSync(dirname(out), { recursive: true });

    const filter =
        `fps=${options.fps},scale=${options.width}:-1:flags=lanczos,split[a][b];` +
        `[a]palettegen=max_colors=${options.colors}:stats_mode=diff[p];` +
        `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;

    console.log(`${basename(input)} → ${out}`);
    console.log(`  start ${options.start}s, ${options.duration}s, ${options.width}px, ${options.fps} fps, ${options.colors} colors`);
    execFileSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", String(options.start), "-t", String(options.duration),
        "-i", input,
        "-vf", filter,
        "-loop", "0",
        out,
    ], { stdio: "inherit" });

    const sizeMb = statSync(out).size / (1024 * 1024);
    console.log(`  done: ${sizeMb.toFixed(1)} MB`);
    if (sizeMb > WARN_SIZE_MB) {
        console.log(`  over ${WARN_SIZE_MB} MB — try a lower --fps, --width or --colors, or a shorter --duration`);
    }
}

try {
    Main();
} catch (error) {
    console.error(`make-gif: ${error.message}`);
    process.exit(1);
}
