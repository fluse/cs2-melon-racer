[Mapping API](README.md) › **25. Tutorial stations** · [← Catapults](24-catapults.md)

# 25. Tutorial stations

The tutorial in stations: six rooms a melon drives into in any order, each
teaching one part of the game step by step. While the melon is in one, a
card on the left of the HUD explains the current step (help text, the keys
to press, an animated diagram) and ticks it off once the player has done
it. The steps themselves are script-side (`TUTORIAL_STATIONS` in
`tutorial/constants.js`); the map only says where each station is, where
its goals are and where a melon respawns.

`tools/maps/make-tutorial-prefab.mjs` builds all of it as
`maps/prefabs/tutorial_stations_course.vmap` (overwritten on every run),
placed in `maps/prefabs/tutorial_stations.vmap` (yours to decorate). Two
halls side by side — stations 1–3 and 4–6 — joined by
[teleporters](07-teleporters.md) (`teleport_stop_to_tutorial_spawn_4` at hall
A's end, `teleport_stop_to_tutorial_back_3` at hall B's start): one hall
wouldn't fit the map's ±16384. Every step has its own **section** in its
room: a glowing line across the floor where it starts and, lying on the
floor just past it, the step's number and text, read from `TUTORIAL_STATIONS` — the same
number the HUD card shows in the step's box.

| Station | Teaches | Goals in the map |
|---|---|---|
| 1 | Driving: W, S, round a post, steering by looking (slalom), jumping | `a`, `b`, `c` (three gates), `hurdle` (behind a 40-high hurdle) |
| 2 | Boost & heal: boost, its health cost, a heal zone, momentum | — (a [full-heal zone](09-heal-zones.md#full-heal-zone) on the way) |
| 3 | Walls: wall jump, 45 degrees, climbing with wall jumps (a shaft 64 wide: the far wall at the top of a wall jump's hop) | `climb` (the shelf, 224 up) |
| 4 | Crashes: boosting too long, a wall too fast, a fall too far | — |
| 5 | Menu: open it, a skin, the level, leaderboards, drone mode | — |
| 6 | Races: time trials, Grand Prix, the rules | `exit` (the gate to the hub) |

## Station

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) over the whole room |
| Name | `tutorial_station_<id>`, `<id>` 1–6 (pattern `^tutorial_station_(\d+)$`) |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `tutorial_enter` |
| `OnEndTouch` | → `melon_drive_script` → `RunScriptInput` → `tutorial_leave` |

Entering it starts the station from its first step (also a finished one —
it can be done again, without XP). Leaving it hides the card. Rooms may
touch: the next station's `tutorial_enter` takes over.

## Respawn spot

An `info_target` named `tutorial_spawn_<id>`, on the floor where the
station starts, facing into it. Entering the station makes it the melon's
respawn point (not while it's on a track), so the crashes of station 4 —
and any fall elsewhere — start the station over right there. Without one
the respawn point stays as it was.

## Goals

| Setting | Value |
|---|---|
| Class | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) |
| Name | `tutorial_goal_<id>_<goal>` (pattern `^tutorial_goal_(\d+)_([a-z0-9]+)$`), the goals in the table above |
| `OnStartTouch` | → `melon_drive_script` → `RunScriptInput` → `tutorial_goal` |

A goal counts while the melon is in station `<id>` — also when it's reached
on an earlier step: the step asking for it is done as soon as it comes.

## Entrance

An `info_target` named `tutorial_entrance` where the stations begin: the
user menu's developer button "Tutorial Stations" (Test Triggers page) sends
a melon there — like "Play Tutorial", out of any race, the spot its respawn
point. A [teleporter](07-teleporters.md) named
`teleport_to_tutorial_entrance` works too.

## Ghost melons

A see-through melon driving a station's move again and again, to copy:

| Entity | Name |
|---|---|
| `prop_dynamic` (the melon model, not solid) | `tutorial_ghost_<id>` (pattern `^tutorial_ghost_(\d+)$`) |
| `info_target`s, its path in order | `tutorial_ghost_<id>_1`, `tutorial_ghost_<id>_2`, … (at least two) |

The script finds them every `TUTORIAL_GHOST_SCAN_SECONDS`, tints them
see-through and moves each along its points at `TUTORIAL_GHOST_SPEED`,
waits `TUTORIAL_GHOST_PAUSE` at the end and starts over. The prefab has
one in station 1 (the slalom and the hurdle), 3 (in at 45 degrees, off the
wall) and 4 (into the crash wall).

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `TUTORIAL_MAX_STEPS` | 5 | steps a station has at most (rows on the card) | `tutorial/constants.js` |
| `TUTORIAL_READ_SECONDS` | 5 s | a step that only explains, shown this long | `tutorial/constants.js` |
| `TUTORIAL_STEP_DONE_SECONDS` | 0.9 s | a finished step's tick before the next step | `tutorial/constants.js` |
| `TUTORIAL_COMPLETE_HUD_SECONDS` | 5 s | "STATION COMPLETE" after the last step | `tutorial/constants.js` |
| `XP_TUTORIAL_STATION` | 20 | XP for a station's first finish | `tutorial/constants.js` |
| `TUTORIAL_GHOST_SPEED` | 420 u/s | a ghost melon's speed | `tutorial/constants.js` |
| `TUTORIAL_GHOST_PAUSE` | 1.2 s | its wait at the path's end | `tutorial/constants.js` |
| `TUTORIAL_GHOST_SCAN_SECONDS` | 2 s | how often the map is searched for ghosts | `tutorial/constants.js` |

## Rules

- The finished stations are saved per player name
  (`SAVE_DATA_TUTORIAL_KEY`); the card's station row shows them gold.
- Station 4 asks for a break by a cause: boosting until the health is gone,
  a crash (an impact or a wall hit), a fall (an impact or a kill trigger).
- The menu station's checks need no map work: the script sees the menu.

---
[← Catapults](24-catapults.md) · [Mapping API](README.md)
