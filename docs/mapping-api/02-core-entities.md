[Mapping API](README.md) › **2. Core entities** · [← Conventions](01-conventions.md) · [Effect templates →](03-effect-templates.md)

# 2. Core entities

## Required

The map doesn't work without these. Exactly one of each.

| Name | Class | Key setting | Purpose |
|---|---|---|---|
| `gamemode` | `point_script` | `cs_script` = `maps/scripts/gamemode.vjs` | cvars, teams, no combat. The name isn't looked up — just the convention. |
| `melon_drive_script` | `point_script` | `cs_script` = `maps/scripts/melon_drive.vjs` | **Target of every output** in the Mapping API. |
| `speed_hud` | `custom_hud_layout` | `layout` = `panorama/layout/custom_game/speedometer.vxml` | The whole HUD (speedometer, countdown, hub modal, user menu, …). |
| `melon_template` | `point_template` | Template01 = a `prop_physics` with the melon model | Spawned once per player. Where it sits doesn't matter — the melon is moved into place. |
| `hub_spawn` | `info_player_start` (any named point entity) | — | See [spawn points](#spawn-points). |
| `hub_start_trigger` | `trigger_multiple` | `hub_enter` + `hub_leave` | The hub's start area — see [Hub](05-hub.md). |

## Spawn points

All placed `SPAWN_UP_OFFSET` (40) above the floor traced straight down
from the entity, facing its yaw ([conventions §5](01-conventions.md#5-transforms-are-used-directly)).

| Name | Class | Required | Used for | Without it |
|---|---|---|---|---|
| `hub_spawn` | `info_player_start` | **yes** | Returning to the hub: heat over, abort, menu button, `hub_teleport` | No fallback — melons have nowhere to go. |
| `hub_spawn_facing` | `info_target` | — | Only its angle counts: which way a melon at `hub_spawn` faces | `hub_spawn`'s own angle. |
| `intro_spawn` | `info_player_start` | — | A player's very first melon (tutorial area); also the user menu's "Play Tutorial" target and that kart's first respawn point | `hub_spawn` is used. |

Track spawns (`start_spawn_*`, `checkpoint_spawn_*`) are on the
[Tracks](04-tracks.md) page.

---
[← Conventions](01-conventions.md) · [Mapping API](README.md) · [Effect templates →](03-effect-templates.md)
