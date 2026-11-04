// The tutorial stations (tools/maps/make-tutorial-prefab.mjs builds the map
// side): six stations, each a trigger the melon drives into, with up to
// TUTORIAL_MAX_STEPS steps the HUD explains one after the other and checks
// (tutorial/logic.js). Visited freely, in any order — the HUD's station row
// shows which are done (saved per player name). See "Tutorial stations" in
// GAMEPLAY.md and docs/mapping-api/25-tutorial-stations.md.
import { WALL_BOUNCE_ENABLED } from "../movement/wall-bounce/constants.js";

// --- Hammer names ---

// A station: a trigger_multiple named tutorial_station_<id> (1..6), OnStartTouch
// -> tutorial_enter, OnEndTouch -> tutorial_leave.
export const TUTORIAL_STATION_NAME_PATTERN = /^tutorial_station_(\d+)$/;
// A goal inside a station ("drive through the gate", "reach the ledge"): a
// trigger_multiple named tutorial_goal_<station>_<goal>, OnStartTouch -> tutorial_goal.
export const TUTORIAL_GOAL_NAME_PATTERN = /^tutorial_goal_(\d+)_([a-z0-9]+)$/;
// Where a melon respawns while in station <id> (a break, the respawn button):
// an info_target named tutorial_spawn_<id>, facing its yaw. Entering the
// station makes it the respawn point.
export const TUTORIAL_SPAWN_NAME_PREFIX = "tutorial_spawn_";
// Where the stations start: an info_target the user menu's developer
// "Tutorial Stations" button (and any teleport_to_tutorial_entrance) sends a melon to.
export const TUTORIAL_ENTRANCE_NAME = "tutorial_entrance";
// A ghost melon showing a station's move: a prop_dynamic named
// tutorial_ghost_<id>, moved by the script along the info_targets
// tutorial_ghost_<id>_<n> (n = 1, 2, … in order) and round again.
export const TUTORIAL_GHOST_NAME_PATTERN = /^tutorial_ghost_(\d+)$/;
export const TUTORIAL_GHOST_PATH_PREFIX = "tutorial_ghost_"; // + "<id>_<n>"

// --- Tunables ---

export const TUTORIAL_MAX_STEPS = 5; // step rows on the HUD card (tutorial_step_<i>)
export const TUTORIAL_READ_SECONDS = 5; // a "read" step without its own seconds
export const TUTORIAL_STEP_DONE_SECONDS = 0.9; // a finished step shows its tick this long before the next one
export const TUTORIAL_COMPLETE_HUD_SECONDS = 5; // "STATION COMPLETE" after the last step
export const TUTORIAL_PROGRESS_SEGMENTS = 10; // the current step's progress bar (tutorial_progress_<i>)
export const TUTORIAL_HUD_UPDATE_SECONDS = 0.1; // the card is rebuilt this often while in a station
export const TUTORIAL_GHOST_SPEED = 420; // units/s along its path
export const TUTORIAL_GHOST_PAUSE = 1.2; // seconds it waits at the path's end before starting over
export const TUTORIAL_GHOST_SCAN_SECONDS = 2; // the map is searched for ghosts this often
export const TUTORIAL_GHOST_COLOR = { r: 140, g: 255, b: 170, a: 110 }; // see-through, so it reads as a demo, not a player
// XP for finishing a station the first time (each one once per player name).
export const XP_TUTORIAL_STATION = 20;
export const XP_REASON_TUTORIAL = "TUTORIAL";
// Key of the finished stations in the addon's save data: { [playerName]: number[] }.
export const SAVE_DATA_TUTORIAL_KEY = "tutorial";

// --- The stations ---

/**
 * What a step checks (tutorial/logic.js, StepProgress):
 *   hold      every one of `inputs` held, moving at least `minSpeed`, for `seconds` in all
 *   each      each of `inputs` held (moving at least `minSpeed`) for `seconds`
 *   turn      the view turned `degrees` in all while one of `inputs` is held, moving at least `minSpeed`
 *   goals     every tutorial_goal_<station>_<id> in `goals` reached
 *   boost     the attack boost on for `seconds` in all
 *   healthLost  health at least `amount` below full
 *   healFull  in a heal zone with full health
 *   momentum  `steps` momentum steps
 *   wallJump  `count` wall jumps, each rated at least `minRating` (if given)
 *   bounce    `count` wall bounces rated at least `minRating`, the jump timed at least `minJump` (0..1)
 *   break     the melon breaks by one of `causes` (BreakCause in health/breaking/breaking.js)
 *   menuOpen  the user menu open
 *   menuRead  the user menu open for `seconds`
 *   menuPage  the user menu showing page `page`
 *   skin      a different skin picked
 *   drone     drone mode switched on and off again
 *   read      `seconds` (default TUTORIAL_READ_SECONDS) — explanations only
 * @typedef {{ kind: "hold" | "each", inputs: string[], seconds: number, minSpeed?: number }
 *   | { kind: "turn", inputs: string[], degrees: number, minSpeed?: number }
 *   | { kind: "goals", goals: string[] }
 *   | { kind: "boost", seconds: number }
 *   | { kind: "healthLost", amount: number }
 *   | { kind: "healFull" }
 *   | { kind: "momentum", steps: number }
 *   | { kind: "wallJump", count: number, minRating?: string }
 *   | { kind: "bounce", count: number, minRating?: string, minJump?: number }
 *   | { kind: "break", causes: string[] }
 *   | { kind: "menuOpen" } | { kind: "menuRead", seconds: number } | { kind: "menuPage", page: string }
 *   | { kind: "skin" } | { kind: "drone" } | { kind: "read", seconds?: number }} TutorialCheck
 * A step: what to do (`text`, the step list), how (`help`, under it), the
 * keys lit on the HUD's keyboard (TUTORIAL_KEYS) and the animated diagram
 * shown (TUTORIAL_DIAGRAMS), and its check.
 * @typedef {{ text: string, help: string, keys?: string[], diagram?: string, check: TutorialCheck }} TutorialStep
 * @typedef {{ id: number, title: string, steps: TutorialStep[] }} TutorialStation
 */

// The keys the HUD's keyboard has (tutorial_key_<key>), in its order, and their caps.
export const TUTORIAL_KEYS = [
    { key: "w", cap: "W" },
    { key: "a", cap: "A" },
    { key: "s", cap: "S" },
    { key: "d", cap: "D" },
    { key: "space", cap: "SPACE", wide: true },
    { key: "mouse1", mouse: "left" },
    { key: "e", cap: "E" },
    { key: "r", cap: "R" },
    { key: "tab", cap: "TAB", wide: true },
];

// The animated diagrams (tutorial_diagram_<name>, src/panorama/melon_racer/tutorial/diagrams.xml).
export const TUTORIAL_DIAGRAMS = ["look", "circle", "drain", "heal", "momentum", "walljump", "angle", "climb", "crash", "fall", "menu-actions", "menu-settings", "menu-profile"];

/** @type {TutorialStep[]} the wall bounce, while WALL_BOUNCE_ENABLED */
const BOUNCE_STEPS = [
    {
        text: "WALL BOUNCE",
        help: "Drive into the wall at 45° along the glowing line: you bounce off faster.",
        keys: ["w"],
        diagram: "angle",
        check: { kind: "bounce", count: 1, minRating: "GOOD" },
    },
    {
        text: "TIME THE JUMP",
        help: "Press SPACE the moment you hit the wall — a timed jump adds even more speed.",
        keys: ["space"],
        diagram: "angle",
        check: { kind: "bounce", count: 1, minRating: "GOOD", minJump: 0.5 },
    },
];

/** @type {TutorialStation[]} */
export const TUTORIAL_STATIONS = [
    {
        id: 1,
        title: "DRIVING",
        steps: [
            { text: "DRIVE FORWARD", help: "Hold W. Your melon rolls the way you look.", keys: ["w"], check: { kind: "hold", inputs: ["forward"], seconds: 1.5, minSpeed: 200 } },
            { text: "BRAKE & REVERSE", help: "Hold S to brake — keep holding it to roll back.", keys: ["s"], check: { kind: "hold", inputs: ["back"], seconds: 1.2 } },
            { text: "ROUND THE POST", help: "Hold W and keep turning the mouse: the melon follows your view. Drive once round the glowing post.", keys: ["w"], diagram: "circle", check: { kind: "turn", inputs: ["forward"], degrees: 360, minSpeed: 150 } },
            { text: "STEER WITH THE MOUSE", help: "There's no turning key: look where you want to go. Drive through all 3 green gates.", keys: ["w"], diagram: "look", check: { kind: "goals", goals: ["a", "b", "c"] } },
            { text: "JUMP", help: "Press SPACE to jump — only off the ground. Jump the hurdle.", keys: ["space"], check: { kind: "goals", goals: ["hurdle"] } },
        ],
    },
    {
        id: 2,
        title: "BOOST & HEAL",
        steps: [
            { text: "BOOST", help: "Hold MOUSE1: more speed, past your normal top speed.", keys: ["mouse1"], check: { kind: "boost", seconds: 2 } },
            { text: "BOOSTING COSTS HEALTH", help: "The bar under your speed drains while you boost. At zero your melon breaks!", keys: ["mouse1"], diagram: "drain", check: { kind: "healthLost", amount: 30 } },
            { text: "HEAL UP", help: "Drive into the heal gate and stay until the bar is full again.", diagram: "heal", check: { kind: "healFull" } },
            { text: "BUILD MOMENTUM", help: "Hit top speed, let go of W for a moment, hit it again — quickly, never below 30 km/h: your top speed grows.", keys: ["w"], diagram: "momentum", check: { kind: "momentum", steps: 2 } },
        ],
    },
    {
        id: 3,
        title: "WALLS",
        steps: [
            ...(WALL_BOUNCE_ENABLED ? BOUNCE_STEPS : []),
            { text: "WALL JUMP", help: "Jump at the glowing spot on the wall and press SPACE again the moment you touch it: you push off the wall and up.", keys: ["space"], diagram: "walljump", check: { kind: "wallJump", count: 1 } },
            { text: "HIT IT AT 45°", help: "Come in along the glowing line, 45° to the wall: GOOD or PERFECT wall jumps boost you.", keys: ["space"], diagram: "angle", check: { kind: "wallJump", count: 1, minRating: "GOOD" } },
            { text: "CLIMB WITH WALL JUMPS", help: "Drive into the narrow shaft, jump, then wall jump from side to side up onto the shelf. The dots next to your speed are your 3 charges — the blue zone keeps them full.", keys: ["space"], diagram: "climb", check: { kind: "goals", goals: ["climb"] } },
        ].slice(0, TUTORIAL_MAX_STEPS),
    },
    {
        id: 4,
        title: "CRASHES",
        steps: [
            { text: "BOOST TOO LONG", help: "Hold MOUSE1 until your health runs out — circle round if you run out of room. Go on, break it!", keys: ["mouse1"], diagram: "drain", check: { kind: "break", causes: ["boost"] } },
            { text: "HIT A WALL TOO FAST", help: "Boost head-on into the red wall. Hard hits cost health.", keys: ["w", "mouse1"], diagram: "crash", check: { kind: "break", causes: ["impact", "wall"] } },
            { text: "FALL TOO FAR", help: "Jump off the tower onto the flat floor. Flat landings from high up hurt twice as much — slopes are safe.", keys: ["space"], diagram: "fall", check: { kind: "break", causes: ["impact", "trigger"] } },
            { text: "RESPAWN", help: "You come back at your last checkpoint. Stuck? Menu (E) > Respawn at Checkpoint.", keys: ["e"], check: { kind: "read" } },
        ],
    },
    {
        id: 5,
        title: "MENU",
        steps: [
            { text: "OPEN THE MENU", help: "Press E (USE) — the menu opens anywhere, also mid-race.", keys: ["e"], check: { kind: "menuOpen" } },
            { text: "PICK A SKIN", help: "SETTINGS > MELON: click a skin. Locked ones unlock with your level.", keys: ["e", "mouse1"], diagram: "menu-settings", check: { kind: "skin" } },
            { text: "YOUR LEVEL", help: "Top right: your level and XP. Races, best times and PERFECT hits earn XP.", keys: ["e"], diagram: "menu-profile", check: { kind: "menuRead", seconds: 4 } },
            { text: "LEADERBOARDS", help: "ACTIONS > Leaderboards: everyone's best times and stats.", keys: ["e", "mouse1"], diagram: "menu-actions", check: { kind: "menuPage", page: "leaderboards" } },
            { text: "DRONE MODE", help: "ACTIONS > Drone Mode: fly around the map. Press R to come back.", keys: ["e", "r"], diagram: "menu-actions", check: { kind: "drone" } },
        ],
    },
    {
        id: 6,
        title: "RACES",
        steps: [
            { text: "TIME TRIALS", help: "Cross a route's start gate: the clock runs to the finish. Beat your best time!", check: { kind: "read", seconds: 6 } },
            { text: "RESTART & BEST TIMES", help: "R restarts a time trial. Hold TAB for the best times, A / D page through the routes.", keys: ["r", "tab"], check: { kind: "read", seconds: 6 } },
            { text: "GRAND PRIX", help: "In the hub, stand in the start zone and click Start Grand Prix. The others get 10 s to join with R.", keys: ["r"], check: { kind: "read", seconds: 6 } },
            { text: "POINTS & RULES", help: "Points by place in every heat. After the winner, 30 s to finish. No checkpoint for 60 s = out.", check: { kind: "read", seconds: 7 } },
            { text: "OFF TO THE HUB", help: "Drive through the exit gate. Have fun!", keys: ["w"], check: { kind: "goals", goals: ["exit"] } },
        ],
    },
];
