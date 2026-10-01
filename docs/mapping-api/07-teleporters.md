[Mapping API](README.md) › **7. Teleporters** · [← Paint triggers](06-paint-triggers.md) · [Kill triggers →](08-kill-triggers.md)

# 7. Teleporters

Generic teleports — the trigger's name says where to and how.

## Setup

| Entity | Class | Name | Setting |
|---|---|---|---|
| Destination | any named point entity, e.g. `info_target` | anything, by convention `tp_dest_…` | origin = arrival spot, yaw = arrival facing |
| Trigger | `trigger_multiple` ([standard setup](01-conventions.md#3-every-melon-trigger-is-set-up-the-same-way)) | see [name variants](#name-variants) | `OnStartTouch` → `melon_drive_script` → `RunScriptInput` → `melon_teleport` |

Name pattern (everything after `to_` is the destination's exact name):

`^teleport_(?:(stop|keep)_)?(checkpoint_)?to_(.+)$`

## Name variants

| Trigger name | Speed on arrival | Sets respawn point |
|---|---|---|
| `teleport_to_<destination>` | per `TELEPORT_KEEP_SPEED` (currently: kept) | no |
| `teleport_stop_to_<destination>` | standing still | no |
| `teleport_keep_to_<destination>` | horizontal speed kept, along the new facing | no |
| `teleport_checkpoint_to_<destination>` | per `TELEPORT_KEEP_SPEED` | **yes** |
| `teleport_stop_checkpoint_to_<destination>` | standing still | **yes** |
| `teleport_keep_checkpoint_to_<destination>` | kept | **yes** |

Example: `teleport_stop_to_tp_dest_hub_back` → arrives at the entity
`tp_dest_hub_back`, standing still.

## Values

| Constant | Value | Meaning | Defined in |
|---|---|---|---|
| `TELEPORT_UP_OFFSET` | 40 units | arrival height above the destination's origin | `zones/teleport/constants.js` |
| `TELEPORT_KEEP_SPEED` | `true` | default for plain `teleport_to_` | `zones/teleport/constants.js` |

## Rules

- The melon arrives facing the destination's yaw; the player's view turns
  with it. Vertical speed is always dropped.
- A teleport **only moves** the melon: health, respawn point and
  checkpoint/lap progress stay as they were — a teleporter can't skip
  checkpoints.
- **Respawn teleporter** (`checkpoint_` variants): the destination also
  becomes the melon's respawn point after a break — for the tutorial, so a
  break doesn't send it back to its start. The next checkpoint, respawn
  teleporter, hub or tutorial button replaces it.
- Ignored for broken melons and race-locked melons (countdown, finished).
- To send a melon to the hub and out of a heat, use
  [`hub_teleport`](05-hub.md#sending-melons-to-the-hub) instead.

## Checked by `npm test`

| Mistake | |
|---|---|
| `melon_teleport` from a trigger not named like a variant above | ✗ |
| destination entity doesn't exist | ✗ |
| `teleport_to_*` trigger without the `melon_teleport` output | ✗ |

---
[← Paint triggers](06-paint-triggers.md) · [Mapping API](README.md) · [Kill triggers →](08-kill-triggers.md)
