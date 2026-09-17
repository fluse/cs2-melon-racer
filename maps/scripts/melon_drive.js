import {
    Instance,
    CSInputs,
    CSMoveType,
    CustomCameraMode,
    PointTemplate,
} from "cs_script/point_script";

// Free-look melon driving: each player gets their own prop_physics melon
// (spawned from a point_template placed in Hammer). Steering direction comes
// from where the player is looking (mouse), not a separate turn control:
// W/S push the melon forward/back along the camera's look direction, A/D
// strafe it left/right relative to that same direction, and Space jumps.
// The player's own pawn is frozen (and hidden) at its spawn position and
// left there — it deliberately does NOT track the melon's position. Doing
// that used to make the pawn's solid hitbox constantly overlap the melon's
// physics collision, and the two would fight/shove each other every tick.
// The camera follows the melon directly (CustomPlayerCamera), so the pawn
// doesn't need to be anywhere near it for the view to work.

const MELON_TEMPLATE_NAME = "melon_template";

// Force ratios ported from the original melonracer GMod gamemode
// (sent_melon_base/init.lua ENT:Think + gamemode/shared.lua DefXSpeed):
// forward is the strongest push, reverse is half that, strafe is weaker
// still — keeping FORWARD_ACCEL as our existing tuned baseline.
const FORWARD_ACCEL = 900; // units/sec^2 while holding forward
const REVERSE_ACCEL = 450; // 0.5x forward, matches original's Reverse/Forward ratio
const STRAFE_ACCEL = 360; // 0.4x forward, matches original's Strafe/Forward ratio
const MAX_SPEED = 650; // units/sec, horizontal speed cap
const COAST_FRICTION = 500; // units/sec^2 horizontal slowdown with no input
const JUMP_SPEED = 320; // units/sec upward impulse
// Jump is no longer gated on being grounded (the melon wobbles/bounces
// enough while rolling that a ground trace was unreliable) — instead it's a
// simple cooldown: always available, but only once per JUMP_COOLDOWN
// seconds. The HUD shows a recharge bar so the player can see when it's up.
const JUMP_COOLDOWN = 1.5; // seconds

// Impact damage: every tick we compare the velocity we commanded last tick
// against the melon's actual velocity now. A big gap means physics forcibly
// overrode our command — a wall crash or a hard landing — since gravity and
// our own steering only ever change velocity gradually. That gap's
// magnitude is the "impact speed" damage is based on.
const MELON_MAX_HEALTH = 100;
const IMPACT_DAMAGE_THRESHOLD = 450; // units/sec of sudden velocity change before it starts to hurt
const IMPACT_DAMAGE_SCALE = 0.2; // health lost per unit/sec beyond the threshold

// The map has multiple separate tracks, so a checkpoint's script input
// parameter names both which track it belongs to and its position along
// that track: "checkpoint_<trackId>_<index>", e.g. "checkpoint_2_5" is
// track 2's 5th checkpoint. Registered up front for every combination (see
// bottom of file) — raise these if a track ends up needing more checkpoints,
// or the map more tracks, than currently allowed for.
const MAX_TRACKS = 8;
const MAX_CHECKPOINTS_PER_TRACK = 32;

// Race flow: HUB (default/gather) -> COUNTDOWN (locked, pre-race) -> RACING
// -> BREAK (finished, waiting for the next heat) -> back to COUNTDOWN on the
// next track, or back to HUB after the last one. See GAMEPLAY.md's "Hub ->
// race -> next-track flow" for the full design.
const RacePhase = /** @type {const} */ ({
    HUB: "HUB",
    COUNTDOWN: "COUNTDOWN",
    RACING: "RACING",
    BREAK: "BREAK",
});
/** @type {typeof RacePhase[keyof typeof RacePhase]} */
let phase = RacePhase.HUB;
/** Which track the current/last heat was run on — undefined while in HUB.
 * @type {number | undefined} */
let activeTrackId = undefined;
/** GetGameTime() at which the current COUNTDOWN/BREAK phase should end. */
let phaseEndTime = 0;

const HUB_TRIGGER_NAME = "hub_start_trigger";

// Paint triggers: place a trigger_multiple anywhere (hub is the intended
// use, but nothing restricts it there) named "paint_trigger_<r>_<g>_<b>"
// (e.g. "paint_trigger_255_0_0" for red), filtered to prop_physics like the
// other triggers. Its OnStartTouch calls RunScriptInput "melon_paint" on
// this point_script — the color itself is read back off the trigger's own
// name (regex below), not the script input parameter, so adding/changing a
// paint trigger's color is a pure Hammer edit, same convention as
// track_start_* in GetTrackConfig().
const PAINT_TRIGGER_NAME_PATTERN = /^paint_trigger_(\d+)_(\d+)_(\d+)$/;
const COUNTDOWN_SECONDS = 3;
const BREAK_SECONDS = 10; // fixed by the original request
// Spacing between racers teleported onto the same start line side-by-side,
// so they don't spawn stacked on top of each other.
const RACE_SPAWN_LATERAL_SPACING = 120;

// Per-track checkpoint/lap config comes straight from Hammer instead of a
// hand-maintained lookup: each track has one trigger_multiple named
// "track_start_<trackId>_cp<checkpointCount>_laps<lapsToWin>" (e.g.
// "track_start_1_cp8_laps3"). Its transform also doubles as where racers are
// teleported to start that track. Parsed once and cached — the geometry
// can't change without a full map reload anyway. Only the entity *name* is
// kept, not the entity handle itself: unlike Instance.FindEntityByName's
// handles, the ones yielded by FindEntitiesByClass's iterator below don't
// stay valid once the loop moves on, so resolving to a live entity happens
// at each point of use instead (see BeginHeat).
const START_TRIGGER_NAME_PATTERN = /^track_start_(\d+)_cp(\d+)_laps(\d+)$/;
/** @typedef {{ checkpoints: number, lapsToWin: number, startEntityName: string }} TrackConfig */
/** @type {Record<number, TrackConfig> | null} */
let trackConfigCache = null;

function GetTrackConfig() {
    if (trackConfigCache) {
        return trackConfigCache;
    }
    /** @type {Record<number, TrackConfig>} */
    const config = {};
    for (const trigger of Instance.FindEntitiesByClass("trigger_multiple")) {
        const match = START_TRIGGER_NAME_PATTERN.exec(trigger.GetEntityName());
        if (!match) {
            continue;
        }
        config[Number(match[1])] = {
            checkpoints: Number(match[2]),
            lapsToWin: Number(match[3]),
            startEntityName: trigger.GetEntityName(),
        };
    }
    if (Object.keys(config).length === 0) {
        // Don't cache an empty result — entities may not have spawned yet.
        Debug("GetTrackConfig: no track_start_<id>_cp<N>_laps<M> triggers found yet");
        return config;
    }
    trackConfigCache = config;
    Debug(`GetTrackConfig: found track(s) ${JSON.stringify(Object.keys(config))}`);
    return config;
}

/** Track ids in race order (ascending), derived from whatever start triggers exist. */
function GetTrackOrder() {
    return Object.keys(GetTrackConfig()).map(Number).sort((a, b) => a - b);
}

// How far in front of (and above) the player to spawn their melon, so it
// doesn't spawn overlapping the player's own hitbox.
const SPAWN_FORWARD_OFFSET = 80;
const SPAWN_UP_OFFSET = 40;

// Race-flow teleports (heat start, return-to-hub) target a trigger_multiple's
// raw GetAbsOrigin() — Hammer mappers commonly sink a trigger's brush a bit
// into the floor so a fast-moving physics prop reliably touches it instead
// of tunneling past a paper-thin volume. Teleporting the melon to that exact
// height would embed it in solid ground; VPhysics can't resolve that
// overlap upward and the melon tunnels down through the floor instead. Lift
// the target up by this much so the melon always drops onto the floor from
// just above it, same trick as SPAWN_UP_OFFSET above.
const TELEPORT_UP_OFFSET = 40;

// cs_script has no "disable collision" call for a pawn, so instead of
// fighting the melon's physics forever, park the frozen pawn far enough
// above the track that its hitbox is physically unreachable. Lower this if
// it turns out to exceed the map's compiled bounds.
const PAWN_PARK_HEIGHT = 3000;

// Offsets for CameraFollowConfig — behind and above the melon.
const FOLLOW_OFFSET = { x: 0, y: 0, z: 20 };
const CAMERA_OFFSET = { x: -220, y: 0, z: 110 };

// Name of the custom_hud_layout entity (place one in Hammer pointing at
// panorama/layout/custom_game/speedometer.vxml) that shows the speedometer.
const SPEED_HUD_ENTITY_NAME = "speed_hud";
// Hammer units/sec -> km/h (1 unit = 1 inch: units/sec * 0.0254 * 3.6).
const UNITS_TO_KMH = 0.0254 * 3.6;

// Toggle to false once driving works to quiet the console back down.
const DEBUG = true;
/** @param {string} text */
function Debug(text) {
    if (DEBUG) {
        Instance.Msg(`[melon_drive] ${text}`);
    }
}

/**
 * @typedef {{
 *   pawn: any, melon: any, nextJumpTime: number,
 *   health: number, lastVelocity: { x: number, y: number, z: number } | undefined,
 *   trackId: number | undefined, checkpointIndex: number, checkpointPosition: any, checkpointAngles: any,
 *   lapsCompleted: number, inHub: boolean, racing: boolean, finished: boolean, locked: boolean,
 * }} Kart
 */
/** @type {Map<number, Kart>} */
const karts = new Map();

// The first player to get a kart becomes the moderator, who can abort a
// heat that's already running (see "Moderator" in GAMEPLAY.md). If they
// disconnect, the next-oldest remaining player is promoted so there's
// always a moderator whenever anyone is on the map.
/** @type {number | undefined} */
let moderatorSlot = undefined;

// Safety net: moderatorSlot can otherwise go stale without a clean
// OnPlayerDisconnect firing for the old holder — a tools-mode script/map
// reload, or a kart getting pruned by Think's invalid-melon/pawn check
// below — leaving it pointing at a slot nobody occupies. Left unchecked,
// that permanently hides the abort button from every remaining player
// (IsModerator never matches), which is exactly what strands a solo
// player unable to abort a heat nobody's actually racing. Called every
// Think tick (after invalid karts are pruned) and on disconnect.
function EnsureModerator() {
    if (moderatorSlot !== undefined && karts.has(moderatorSlot)) {
        return;
    }
    const next = karts.keys().next();
    const reassigned = next.done ? undefined : next.value;
    if (reassigned !== moderatorSlot) {
        Debug(`EnsureModerator: moderatorSlot ${moderatorSlot} has no live kart, reassigning to ${reassigned}`);
        moderatorSlot = reassigned;
    }
}

/** @param {number | undefined} slot */
function IsModerator(slot) {
    return slot !== undefined && slot === moderatorSlot;
}

/** @param {any} melon */
function FindKartByMelon(melon) {
    for (const kart of karts.values()) {
        if (kart.melon === melon) {
            return kart;
        }
    }
    return undefined;
}

/** @type {any} */
let speedHud = null;
function GetSpeedHud() {
    if (!speedHud || !speedHud.IsValid()) {
        speedHud = Instance.FindEntityByName(SPEED_HUD_ENTITY_NAME);
        if (!speedHud) {
            Debug(`GetSpeedHud: no entity named "${SPEED_HUD_ENTITY_NAME}" found — add a custom_hud_layout in Hammer`);
        }
    }
    return speedHud;
}

/** @param {number} slot @param {any} melon */
function UpdateSpeedHud(slot, melon) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const vel = melon.GetAbsVelocity();
    const kmh = Math.round(Math.hypot(vel.x, vel.y) * UNITS_TO_KMH);
    hud.SetDialogVariableStringForPlayer(slot, "speed_panel", "speed", String(kmh));
}

// Segmented jump-recharge bar — see JUMP_BAR_SEGMENTS panel ids
// ("jump_seg_0" .. "jump_seg_{N-1}") in speedometer.xml.
const JUMP_BAR_SEGMENTS = 10;

/** @param {number} slot @param {{ nextJumpTime: number }} kart */
function UpdateJumpHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const charge = GetJumpChargeFraction(kart);
    const filledSegments = Math.round(charge * JUMP_BAR_SEGMENTS);
    for (let i = 0; i < JUMP_BAR_SEGMENTS; i++) {
        hud.SetHasClassForPlayer(slot, `jump_seg_${i}`, "Filled", i < filledSegments);
    }
    hud.SetHasClassForPlayer(slot, "jump_bar", "Ready", charge >= 1);
}

/** @param {number} slot @param {Kart} kart */
function UpdateCheckpointHud(slot, kart) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    const trackId = kart.trackId;
    hud.SetHasClassForPlayer(slot, "checkpoint_panel", "Hidden", trackId === undefined);
    if (trackId === undefined) {
        return;
    }
    const config = GetTrackConfig()[trackId];
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "current", String(kart.checkpointIndex));
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "total", config ? String(config.checkpoints) : "?");
    const currentLap = config ? Math.min(kart.lapsCompleted + 1, config.lapsToWin) : kart.lapsCompleted + 1;
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "lap_current", String(currentLap));
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "lap_total", config ? String(config.lapsToWin) : "?");
}

// --- Race flow: hub -> countdown -> racing -> break --------------------
// See GAMEPLAY.md's "Hub -> race -> next-track flow" for the full design.
// Lives here (not a separate point_script) because it's tightly coupled to
// the same per-kart state as checkpoints/laps above.

function CurrentRacers() {
    return [...karts.values()].filter((kart) => kart.racing);
}

/** Track id after `activeTrackId` in race order, or undefined if it was the last one. */
function NextTrackId() {
    if (activeTrackId === undefined) {
        return undefined;
    }
    const order = GetTrackOrder();
    const index = order.indexOf(activeTrackId);
    if (index === -1 || index + 1 >= order.length) {
        return undefined;
    }
    return order[index + 1];
}

// Kept in sync every tick (see Think) as well as on hub_enter, since a
// standing-in-hub player's WaitingForOthers/IsModerator state can change
// underneath them — a heat starting/ending elsewhere, or the moderator
// disconnecting and reassigning to whoever's currently in the hub.
/** @param {number} slot */
function ApplyHubModalState(slot) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "WaitingForOthers", phase !== RacePhase.HUB);
    hud.SetHasClassForPlayer(slot, "hub_modal", "IsModerator", IsModerator(slot));
}

/** @param {number} slot */
function ShowHubModal(slot) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", false);
    ApplyHubModalState(slot);
    hud.SetInputCaptureEnabled(slot, true);
}

/** @param {number} slot */
function HideHubModal(slot) {
    const hud = GetSpeedHud();
    if (!hud) {
        return;
    }
    hud.SetHasClassForPlayer(slot, "hub_modal", "Hidden", true);
    hud.SetInputCaptureEnabled(slot, false);
}

// Clicking "Jetzt starten" pulls every kart *currently standing in the hub
// trigger* into the heat — not every connected player — matching the
// original request that players have to be on that trigger area to race.
function TryStartRace() {
    if (phase !== RacePhase.HUB) {
        Debug("TryStartRace: ignored, a heat is already running");
        return;
    }
    const order = GetTrackOrder();
    if (order.length === 0) {
        Debug("TryStartRace: no track_start_* triggers found, ignoring");
        return;
    }
    const racers = [...karts.values()].filter((kart) => kart.inHub && kart.melon.IsValid());
    if (racers.length === 0) {
        Debug("TryStartRace: no karts currently in the hub trigger, ignoring");
        return;
    }
    for (const kart of racers) {
        kart.racing = true;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot !== undefined) {
            HideHubModal(slot);
        }
    }
    Debug(`TryStartRace: starting heat on track ${order[0]} with ${racers.length} racer(s)`);
    BeginHeat(order[0]);
}

// Moderator-only: cuts a heat short from wherever it's at (COUNTDOWN,
// RACING, or BREAK) and sends everyone back to the hub, same as a normal
// heat ending — see "Moderator" in GAMEPLAY.md.
function TryAbortRace() {
    if (phase === RacePhase.HUB) {
        Debug("TryAbortRace: ignored, no heat is running");
        return;
    }
    Debug(`TryAbortRace: moderator aborted the heat on track ${activeTrackId}`);
    ReturnAllToHub(CurrentRacers());
    phase = RacePhase.HUB;
    activeTrackId = undefined;
}

/** @param {number} trackId */
function BeginHeat(trackId) {
    const config = GetTrackConfig()[trackId];
    const start = config && Instance.FindEntityByName(config.startEntityName);
    if (!start) {
        Debug(`BeginHeat: track ${trackId} has no track_start_* trigger, aborting heat back to HUB`);
        // Route through ReturnAllToHub, not a bare phase reset: callers
        // (TryStartRace, or the BREAK->next-heat transition) may already
        // have marked these karts racing/hidden their hub modal before
        // calling in here, and they'd otherwise be stranded with racing:true
        // and no hub UI, silently swept into whatever heat starts next.
        ReturnAllToHub(CurrentRacers());
        phase = RacePhase.HUB;
        activeTrackId = undefined;
        return;
    }
    activeTrackId = trackId;
    const origin = start.GetAbsOrigin();
    const angles = start.GetAbsAngles();
    const rad = (angles.yaw * Math.PI) / 180;
    // Perpendicular to the start line's facing, to line racers up side by side.
    const rightDir = { x: Math.sin(rad), y: -Math.cos(rad) };

    const racers = CurrentRacers();
    racers.forEach((kart, i) => {
        const lateral = (i - (racers.length - 1) / 2) * RACE_SPAWN_LATERAL_SPACING;
        kart.melon.Teleport({
            position: {
                x: origin.x + rightDir.x * lateral,
                y: origin.y + rightDir.y * lateral,
                z: origin.z + TELEPORT_UP_OFFSET,
            },
            angles,
            velocity: { x: 0, y: 0, z: 0 },
        });
        kart.lastVelocity = undefined;
        // trackId is set directly instead of waiting for the physical
        // checkpoint_<trackId>_1 trigger touch to report it, so the
        // checkpoint/lap panel is already visible ("0/N", lap "1/M") the
        // moment the countdown starts instead of popping in a tick later.
        // checkpointIndex stays at 0 though — the racer hasn't actually
        // reached checkpoint 1 yet, just spawned at/behind it — and only
        // ticks up to 1 once OnCheckpointTouched sees them cross it for
        // real.
        kart.trackId = trackId;
        kart.checkpointIndex = 0;
        kart.lapsCompleted = 0;
        kart.finished = false;
        kart.locked = true;
        kart.checkpointPosition = { x: origin.x, y: origin.y, z: origin.z + TELEPORT_UP_OFFSET };
        kart.checkpointAngles = angles;
    });

    phase = RacePhase.COUNTDOWN;
    phaseEndTime = Instance.GetGameTime() + COUNTDOWN_SECONDS;
    Debug(`BeginHeat: track ${trackId}, ${racers.length} racer(s), countdown started`);
}

/** A kart reached lapsToWin — park it (still locked) until the whole heat ends. */
/** @param {Kart} kart */
function FinishKart(kart) {
    kart.finished = true;
    kart.locked = true;
    Debug(`FinishKart: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} finished track ${activeTrackId}`);
}

/** @param {Kart[]} returning */
function ReturnAllToHub(returning) {
    const hub = Instance.FindEntityByName(HUB_TRIGGER_NAME);
    if (!hub) {
        Debug(`ReturnAllToHub: no entity named "${HUB_TRIGGER_NAME}" found`);
    }
    const hubOrigin = hub?.GetAbsOrigin();
    const hubAngles = hub?.GetAbsAngles();
    for (const kart of returning) {
        kart.racing = false;
        kart.finished = false;
        kart.locked = false;
        kart.inHub = true;
        if (hubOrigin) {
            kart.melon.Teleport({
                position: { x: hubOrigin.x, y: hubOrigin.y, z: hubOrigin.z + TELEPORT_UP_OFFSET },
                angles: hubAngles,
                velocity: { x: 0, y: 0, z: 0 },
            });
        }
        kart.lastVelocity = undefined;
        const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
        if (slot === undefined) {
            continue;
        }
        // Both labels, since ReturnAllToHub can now be reached from any
        // non-HUB phase (a moderator abort can land mid-COUNTDOWN, not just
        // after a heat finishes normally in BREAK).
        GetSpeedHud()?.SetHasClassForPlayer(slot, "countdown_label", "Hidden", true);
        GetSpeedHud()?.SetHasClassForPlayer(slot, "break_label", "Hidden", true);
        ShowHubModal(slot);
    }
}

/** Drives the COUNTDOWN/RACING/BREAK timers and transitions — called once per Think tick. */
/** @param {number} now */
function UpdateRaceFlow(now) {
    const hud = GetSpeedHud();

    if (phase === RacePhase.COUNTDOWN) {
        const racers = CurrentRacers();
        if (racers.length === 0) {
            // Everyone who was in this heat disconnected/despawned before it
            // even started — nothing left to count down for. Without this,
            // the countdown would still finish into RACING below and then
            // get permanently stuck there (see the RACING branch's own
            // "nobody left" check), bricking the race flow for everyone.
            Debug("UpdateRaceFlow: all racers left during countdown, aborting heat back to HUB");
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            return;
        }
        const remaining = phaseEndTime - now;
        const display = remaining > 0 ? String(Math.ceil(remaining)) : "GO!";
        for (const kart of racers) {
            const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
            if (slot === undefined) {
                continue;
            }
            hud?.SetHasClassForPlayer(slot, "countdown_label", "Hidden", false);
            hud?.SetDialogVariableStringForPlayer(slot, "countdown_label", "countdown", display);
        }
        if (remaining <= 0) {
            for (const kart of racers) {
                kart.locked = false;
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot !== undefined) {
                    hud?.SetHasClassForPlayer(slot, "countdown_label", "Hidden", true);
                }
            }
            phase = RacePhase.RACING;
            Debug(`UpdateRaceFlow: countdown finished for track ${activeTrackId}, GO`);
        }
        return;
    }

    if (phase === RacePhase.RACING) {
        const racers = CurrentRacers();
        if (racers.length === 0) {
            // Same "everyone left" case as COUNTDOWN above, but mid-race:
            // without this, an empty heat sits in RACING forever since
            // `racers.every(...)` on an empty array is vacuously true only
            // when length is also checked, and TryStartRace refuses to start
            // a new heat while phase isn't HUB.
            Debug("UpdateRaceFlow: all racers left mid-heat, aborting back to HUB");
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            return;
        }
        if (racers.every((kart) => kart.finished)) {
            phase = RacePhase.BREAK;
            phaseEndTime = now + BREAK_SECONDS;
            const message = NextTrackId() !== undefined ? "Ziel!\nNächste Strecke in 10s…" : "Ziel!\nZurück zum Hub in 10s…";
            for (const kart of racers) {
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot === undefined) {
                    continue;
                }
                hud?.SetHasClassForPlayer(slot, "break_label", "Hidden", false);
                hud?.SetDialogVariableStringForPlayer(slot, "break_label", "break", message);
            }
            Debug(`UpdateRaceFlow: heat on track ${activeTrackId} complete, break started`);
        }
        return;
    }

    if (phase === RacePhase.BREAK && now >= phaseEndTime) {
        const racers = CurrentRacers();
        const nextTrackId = NextTrackId();
        if (nextTrackId !== undefined) {
            for (const kart of racers) {
                const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
                if (slot !== undefined) {
                    hud?.SetHasClassForPlayer(slot, "break_label", "Hidden", true);
                }
            }
            BeginHeat(nextTrackId);
        } else {
            ReturnAllToHub(racers);
            phase = RacePhase.HUB;
            activeTrackId = undefined;
            Debug("UpdateRaceFlow: last track done, group returned to hub");
        }
    }
}

function SpawnMelonFor(pawn) {
    const template = Instance.FindEntityByName(MELON_TEMPLATE_NAME);
    if (!template) {
        Debug(`SpawnMelonFor: no entity named "${MELON_TEMPLATE_NAME}" found at all`);
        return undefined;
    }
    if (!(template instanceof PointTemplate)) {
        Debug(`SpawnMelonFor: entity "${MELON_TEMPLATE_NAME}" exists but is a ${template.GetClassName()}, not a point_template`);
        return undefined;
    }
    const origin = pawn.GetAbsOrigin();
    const eyeAngles = pawn.GetEyeAngles();
    // Spawn a bit in front of the player, not exactly on top of them —
    // spawning overlapping the player's own hitbox causes the physics
    // engine to violently shove the melon away the instant it appears.
    const rad = (eyeAngles.yaw * Math.PI) / 180;
    const spawnPos = {
        x: origin.x + Math.cos(rad) * SPAWN_FORWARD_OFFSET,
        y: origin.y + Math.sin(rad) * SPAWN_FORWARD_OFFSET,
        z: origin.z + SPAWN_UP_OFFSET,
    };
    const spawned = template.ForceSpawn(spawnPos, { pitch: 0, yaw: eyeAngles.yaw, roll: 0 });
    if (!spawned || spawned.length === 0) {
        Debug(`SpawnMelonFor: ForceSpawn() returned nothing — check the point_template's Template entries in Hammer`);
        return undefined;
    }
    Debug(`SpawnMelonFor: spawned ${spawned.length} entity(s) at ${JSON.stringify(spawnPos)}, using [0] = ${spawned[0].GetClassName()}`);
    return spawned[0];
}

/** @param {any} pawn */
function HidePawnModel(pawn) {
    // There's no direct "hide" call — alpha 0 is the standard trick to make
    // the model invisible while keeping the entity (and its camera) alive.
    pawn.SetColor({ r: 255, g: 255, b: 255, a: 0 });
}

/** @param {any} pawn */
function ParkPawn(pawn) {
    // Must run AFTER the melon has been spawned from this pawn's original
    // ground position — otherwise the melon would spawn way up in the sky.
    const origin = pawn.GetAbsOrigin();
    pawn.Teleport({ position: { x: origin.x, y: origin.y, z: origin.z + PAWN_PARK_HEIGHT } });
}

function AttachCamera(pawn, melon) {
    // CustomPlayerCamera lives on the pawn instance, so this must be
    // re-called every time the player gets a fresh pawn (each respawn).
    const camera = pawn.GetCustomCamera();
    camera.SetMode(CustomCameraMode.FOLLOW_POSITION);
    camera.SetFollowConfig({
        followEntity: melon,
        followOffset: FOLLOW_OFFSET,
        cameraOffset: CAMERA_OFFSET,
        clipCameraOffset: true,
    });
    Debug(`AttachCamera: mode=${camera.GetMode()} for slot=${pawn.GetPlayerController()?.GetPlayerSlot()}`);
}

function GetOrCreateKart(pawn) {
    const controller = pawn.GetPlayerController();
    const slot = controller?.GetPlayerSlot();
    if (slot === undefined) {
        Debug("GetOrCreateKart: pawn has no player controller/slot, aborting");
        return undefined;
    }

    let kart = karts.get(slot);
    if (!kart || !kart.melon.IsValid()) {
        Debug(`GetOrCreateKart: slot ${slot} has no valid kart yet, spawning a new melon`);
        const melon = SpawnMelonFor(pawn);
        if (!melon) {
            Debug(`GetOrCreateKart: slot ${slot} — melon spawn failed, no kart created`);
            return undefined;
        }
        if (moderatorSlot === undefined) {
            moderatorSlot = slot;
            Debug(`GetOrCreateKart: slot ${slot} is the first player on the map, assigned as moderator`);
        }
        // No checkpoint reached yet — fall back to the player's own spawn
        // point/facing as the "respawn here if it breaks" location.
        kart = {
            pawn,
            melon,
            nextJumpTime: 0,
            health: MELON_MAX_HEALTH,
            lastVelocity: undefined,
            trackId: undefined,
            checkpointIndex: 0,
            checkpointPosition: pawn.GetAbsOrigin(),
            checkpointAngles: { pitch: 0, yaw: pawn.GetEyeAngles().yaw, roll: 0 },
            lapsCompleted: 0,
            inHub: false,
            racing: false,
            finished: false,
            locked: false,
        };
        karts.set(slot, kart);
    } else {
        kart.pawn = pawn;
        Debug(`GetOrCreateKart: slot ${slot} reusing existing melon`);
    }

    HidePawnModel(pawn);
    AttachCamera(pawn, kart.melon);
    return kart;
}

/** @param {number} slot @param {Kart} kart @param {number} dt */
function UpdateKart(slot, kart, dt) {
    const { pawn, melon } = kart;

    // Locked during the pre-race countdown, and again once a kart has
    // finished its heat (parked so it stops re-triggering checkpoints).
    // Vertical velocity is left alone so gravity still settles it normally —
    // only driving input is suppressed.
    if (kart.locked) {
        const vel = melon.GetAbsVelocity();
        melon.Move({ velocity: { x: 0, y: 0, z: vel.z } });
        kart.lastVelocity = undefined;
        return;
    }

    const currentVelocity = melon.GetAbsVelocity();
    if (kart.lastVelocity) {
        const impactSpeed = Math.hypot(
            currentVelocity.x - kart.lastVelocity.x,
            currentVelocity.y - kart.lastVelocity.y,
            currentVelocity.z - kart.lastVelocity.z
        );
        if (impactSpeed > IMPACT_DAMAGE_THRESHOLD) {
            ApplyImpactDamage(slot, kart, impactSpeed);
            if (kart.health <= 0) {
                BreakMelon(slot, kart);
                return; // teleported/reset this tick — nothing else to update
            }
        }
    }

    // Direction comes from the player's look direction (mouse), not a
    // separate turn control — this is what makes it "free-look" driving.
    const rad = (pawn.GetEyeAngles().yaw * Math.PI) / 180;
    const forwardDir = { x: Math.cos(rad), y: Math.sin(rad) };
    const rightDir = { x: Math.sin(rad), y: -Math.cos(rad) };

    const forwardInput =
        (pawn.IsInputPressed(CSInputs.FORWARD) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.BACK) ? 1 : 0);
    const strafeInput =
        (pawn.IsInputPressed(CSInputs.RIGHT) ? 1 : 0) - (pawn.IsInputPressed(CSInputs.LEFT) ? 1 : 0);

    let vx = currentVelocity.x;
    let vy = currentVelocity.y;

    if (forwardInput !== 0 || strafeInput !== 0) {
        const forwardAccel = forwardInput > 0 ? FORWARD_ACCEL : REVERSE_ACCEL;
        let ax = forwardDir.x * forwardInput * forwardAccel + rightDir.x * strafeInput * STRAFE_ACCEL;
        let ay = forwardDir.y * forwardInput * forwardAccel + rightDir.y * strafeInput * STRAFE_ACCEL;
        vx += ax * dt;
        vy += ay * dt;
    } else {
        const speed = Math.hypot(vx, vy);
        if (speed > 0) {
            const scale = Math.max(0, speed - COAST_FRICTION * dt) / speed;
            vx *= scale;
            vy *= scale;
        }
    }

    const horizSpeed = Math.hypot(vx, vy);
    if (horizSpeed > MAX_SPEED) {
        const scale = MAX_SPEED / horizSpeed;
        vx *= scale;
        vy *= scale;
    }

    // Jump: straight-up force, always allowed (no ground check — the melon
    // wobbles too much while rolling for a ground trace to be reliable),
    // but limited to once per JUMP_COOLDOWN seconds via kart.nextJumpTime.
    let vz = currentVelocity.z;
    if (pawn.WasInputJustPressed(CSInputs.JUMP)) {
        const now = Instance.GetGameTime();
        const ready = now >= kart.nextJumpTime;
        Debug(`Jump pressed: ready=${ready} forwardInput=${forwardInput} strafeInput=${strafeInput}`);
        if (ready) {
            vz = JUMP_SPEED;
            kart.nextJumpTime = now + JUMP_COOLDOWN;
        }
    }

    melon.Move({ velocity: { x: vx, y: vy, z: vz } });
    // What we commanded this tick — compared against the actual velocity
    // physics settles on by next tick to detect collisions (see the top of
    // this function).
    kart.lastVelocity = { x: vx, y: vy, z: vz };
}

/** @param {number} slot @param {Kart} kart @param {number} impactSpeed */
function ApplyImpactDamage(slot, kart, impactSpeed) {
    const damage = (impactSpeed - IMPACT_DAMAGE_THRESHOLD) * IMPACT_DAMAGE_SCALE;
    kart.health -= damage;
    Debug(
        `slot ${slot}: impact ${impactSpeed.toFixed(0)} u/s -> ${damage.toFixed(0)} dmg, ` +
        `health ${kart.health.toFixed(0)}/${MELON_MAX_HEALTH}`
    );
}

/** @param {number} slot @param {Kart} kart */
function BreakMelon(slot, kart) {
    Debug(`slot ${slot}: melon broke — respawning at checkpoint ${kart.checkpointIndex}`);
    kart.melon.Teleport({
        position: kart.checkpointPosition,
        angles: kart.checkpointAngles,
        velocity: { x: 0, y: 0, z: 0 },
    });
    kart.health = MELON_MAX_HEALTH;
    // Cleared, not measured against zero: the teleport above is our own
    // intentional velocity reset, not a physical impact to react to.
    kart.lastVelocity = undefined;
}

/** Fraction of the jump cooldown that has recharged, 0 (just used) to 1 (ready). */
/** @param {{ nextJumpTime: number }} kart */
function GetJumpChargeFraction(kart) {
    const remaining = kart.nextJumpTime - Instance.GetGameTime();
    if (remaining <= 0) {
        return 1;
    }
    return 1 - remaining / JUMP_COOLDOWN;
}

const HEARTBEAT_INTERVAL = 1; // seconds
let lastHeartbeatTime = 0;
// Real elapsed time since the last Think, used for the movement math below —
// see the SetNextThink call at the bottom of Think() for why this isn't a
// fixed interval.
let lastThinkTime = Instance.GetGameTime();

function Think() {
    const now = Instance.GetGameTime();
    const dt = now - lastThinkTime;
    lastThinkTime = now;

    const heartbeat = DEBUG && now - lastHeartbeatTime >= HEARTBEAT_INTERVAL;
    if (heartbeat) {
        lastHeartbeatTime = now;
        Debug(`Think: ${karts.size} kart(s) tracked`);
    }

    for (const [slot, kart] of karts) {
        if (!kart.melon.IsValid() || !kart.pawn.IsValid()) {
            Debug(`Think: slot ${slot} melon/pawn no longer valid, dropping kart`);
            karts.delete(slot);
            continue;
        }
        UpdateKart(slot, kart, dt);
        UpdateSpeedHud(slot, kart.melon);
        UpdateJumpHud(slot, kart);
        UpdateCheckpointHud(slot, kart);
        if (kart.inHub) {
            ApplyHubModalState(slot);
        }
        if (heartbeat) {
            const vel = kart.melon.GetAbsVelocity();
            Debug(
                `Think: slot ${slot} velocity=(${vel.x.toFixed(0)}, ${vel.y.toFixed(0)}, ${vel.z.toFixed(0)}) ` +
                `melonPos=${JSON.stringify(kart.melon.GetAbsOrigin())} eyeYaw=${kart.pawn.GetEyeAngles().yaw.toFixed(0)} ` +
                `input(F/B/L/R/Jump)=${kart.pawn.IsInputPressed(CSInputs.FORWARD)}/${kart.pawn.IsInputPressed(CSInputs.BACK)}/` +
                `${kart.pawn.IsInputPressed(CSInputs.LEFT)}/${kart.pawn.IsInputPressed(CSInputs.RIGHT)}/` +
                `${kart.pawn.IsInputPressed(CSInputs.JUMP)}`
            );
        }
    }
    EnsureModerator();
    UpdateRaceFlow(now);
    // Re-think as soon as possible (every engine tick) rather than on a fixed
    // interval — WasInputJustPressed only reports a button edge for the
    // specific tick it happened on, so polling any slower than the engine's
    // own tick rate means some jump presses land on a tick we never check and
    // are silently lost. Same pattern as cs_script_demo's input.js.
    Instance.SetNextThink(Instance.GetGameTime());
}

Instance.SetThink(Think);
Instance.SetNextThink(Instance.GetGameTime());

// Tools-mode hot reload re-runs this whole file top-to-bottom, which would
// otherwise reset `karts` to an empty Map while the previously spawned
// melons are still alive in the world — the next respawn would then spawn
// a *second* melon on top of the orphaned one and the two would violently
// shove each other apart. Carry the existing tracking across the reload.
// Race-flow phase/activeTrackId/phaseEndTime are carried the same way, so
// reloading mid-heat during dev iteration doesn't strand locked racers in a
// phase that's forgotten it's supposed to unlock/advance them.
Instance.OnScriptReload({
    before: () => ({ karts, phase, activeTrackId, phaseEndTime, moderatorSlot }),
    after: (memory) => {
        if (memory?.karts) {
            for (const [slot, kart] of memory.karts) {
                karts.set(slot, kart);
            }
            phase = memory.phase ?? phase;
            activeTrackId = memory.activeTrackId;
            phaseEndTime = memory.phaseEndTime ?? phaseEndTime;
            moderatorSlot = memory.moderatorSlot;
            Debug(`OnScriptReload: restored ${karts.size} kart(s), phase=${phase}, activeTrackId=${activeTrackId}, moderatorSlot=${moderatorSlot}`);
        }
    },
});

Instance.OnPlayerReset(({ player }) => {
    Debug(`OnPlayerReset: slot=${player.GetPlayerController()?.GetPlayerSlot()}`);
    player.SetMoveType(CSMoveType.NONE);
    GetOrCreateKart(player);
    ParkPawn(player);
});

Instance.OnPlayerDisconnect(({ playerSlot }) => {
    const kart = karts.get(playerSlot);
    if (kart) {
        kart.melon.Remove();
        karts.delete(playerSlot);
    }
    // Promotes the next-oldest remaining player (Map preserves insertion
    // order) so there's always a moderator whenever anyone's still on the
    // map — see EnsureModerator's comment for why this can't just wait for
    // the next Think tick to notice.
    EnsureModerator();
});

// Checkpoints: place a trigger_multiple per checkpoint, filtered to the
// melon (prop_physics) so the frozen/parked pawn can't trigger it, with its
// OnStartTouch calling this point_script's RunScriptInput and a parameter of
// "checkpoint_<trackId>_<index>" — e.g. track 2's 3rd checkpoint is
// "checkpoint_2_3". The trigger's own position/angles become the respawn
// point if the melon breaks after reaching it.
//
// A kart isn't on any track until it touches a "_1" checkpoint, which picks
// (starts its progress on) that track — this is how a racer picks one of
// several tracks in the map. Checkpoints past index 1 only count while the
// kart is already on that same track (so straying onto a different track's
// later checkpoints doesn't skip progress), and only ever move progress
// forward within it. A kart that's racing can't pick a *different* track's
// checkpoint 1 mid-heat either (straying into another track's start zone is
// ignored outright) — letting it through would silently overwrite
// kart.trackId to the wrong track and then reject the racer's own further
// progress on their actual active track.
//
// Re-touching "_1" while *already on* that track (the normal case of
// crossing the start/finish line every lap) deliberately does **not** touch
// lapsCompleted here — that's OnFinishTouched's job, via a separate
// finish_<trackId> input (see below). Keeping "pick a track" and "count a
// completed lap" in two independent inputs means they can both be wired as
// outputs on the very same trigger without caring which one Hammer fires
// first. It *does* still bump checkpointIndex back up to 1 for the new lap
// though — OnFinishTouched resets it to 0 when a lap completes, and without
// this the HUD's checkpoint counter would sit at 0 for the whole first leg
// of every lap after the first, then jump straight to 2.
/** @param {number} trackId @param {number} index @param {Kart} kart @param {any} trigger */
function OnCheckpointTouched(trackId, index, kart, trigger) {
    if (kart.finished) {
        return; // parked after finishing this heat, ignore further touches
    }
    if (index === 1) {
        if (kart.racing && trackId !== activeTrackId) {
            Debug(`checkpoint_${trackId}_1: kart is racing active track ${activeTrackId}, ignoring foreign track's start`);
            return;
        }
        if (kart.trackId !== trackId) {
            kart.trackId = trackId;
            kart.checkpointIndex = 0;
        }
    } else if (kart.trackId !== trackId) {
        Debug(`checkpoint_${trackId}_${index}: kart is on track ${kart.trackId}, ignoring`);
        return;
    }
    if (index <= kart.checkpointIndex) {
        return;
    }
    kart.checkpointIndex = index;
    kart.checkpointPosition = trigger.GetAbsOrigin();
    kart.checkpointAngles = trigger.GetAbsAngles();
    Debug(`checkpoint_${trackId}_${index}: kart advanced to checkpoint ${index} on track ${trackId}`);
}

for (let t = 1; t <= MAX_TRACKS; t++) {
    for (let i = 1; i <= MAX_CHECKPOINTS_PER_TRACK; i++) {
        const trackId = t;
        const index = i;
        Instance.OnScriptInput(`checkpoint_${trackId}_${index}`, ({ caller, activator }) => {
            const kart = activator && FindKartByMelon(activator);
            if (!kart || !caller) {
                Debug(`checkpoint_${trackId}_${index}: activator wasn't a tracked melon, ignoring`);
                return;
            }
            OnCheckpointTouched(trackId, index, kart, caller);
        });
    }
}

// Finish: add an OnStartTouch output, RunScriptInput with parameter
// "finish_<trackId>", to whichever trigger_multiple physically sits on that
// track's finish line — often that's the same trigger as the
// track_start_<trackId>_cp<N>_laps<M> entity itself (start and finish are
// normally the same line), but it can equally be checkpoint_<trackId>_1's
// trigger, or its own separate volume; only the activator (the melon) is
// read here, not which entity fired it, so it doesn't matter which one you
// pick, or whether more than one of them also fires it. Filtered to
// prop_physics like the checkpoints. Deliberately a separate input from
// checkpoint_<trackId>_1 rather than folded into it: this is the one and
// only place that counts a completed lap/finished heat, so it doesn't
// depend on whatever order Hammer fires a trigger's multiple outputs in, and
// gives lap/finish completion its own dedicated debug line to check against
// when a heat won't end. See "Hub -> race -> next-track flow" in
// GAMEPLAY.md.
/** @param {number} trackId @param {Kart} kart */
function OnFinishTouched(trackId, kart) {
    if (kart.finished) {
        return; // already parked after finishing this heat
    }
    if (!kart.racing || trackId !== activeTrackId || kart.trackId !== trackId) {
        Debug(
            `finish_${trackId}: kart isn't actively racing this track ` +
            `(racing=${kart.racing}, trackId=${kart.trackId}, activeTrackId=${activeTrackId}), ignoring`
        );
        return;
    }
    const config = GetTrackConfig()[trackId];
    if (!config || kart.checkpointIndex < config.checkpoints) {
        Debug(`finish_${trackId}: kart hasn't reached all ${config?.checkpoints ?? "?"} checkpoint(s) this lap yet (at ${kart.checkpointIndex}), ignoring`);
        return;
    }
    kart.lapsCompleted += 1;
    Debug(`finish_${trackId}: lap ${kart.lapsCompleted}/${config.lapsToWin} completed on track ${trackId}`);
    if (kart.lapsCompleted >= config.lapsToWin) {
        FinishKart(kart);
    } else {
        // Not done yet — back to "no checkpoints reached" for the next lap
        // (not 1: crossing the finish line itself isn't checkpoint 1 again,
        // it's the boundary between laps).
        kart.checkpointIndex = 0;
    }
}

for (let t = 1; t <= MAX_TRACKS; t++) {
    const trackId = t;
    Instance.OnScriptInput(`finish_${trackId}`, ({ activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (!kart) {
            Debug(`finish_${trackId}: activator wasn't a tracked melon, ignoring`);
            return;
        }
        OnFinishTouched(trackId, kart);
    });
}

// Hub: place a trigger_multiple named "hub_start_trigger" in the hub area,
// filtered to prop_physics like the checkpoints, with OnStartTouch/OnEndTouch
// calling RunScriptInput "hub_enter"/"hub_leave" on this point_script. While a
// kart is inside it, that player sees the "Jetzt starten" modal (or a
// "race in progress" message if a heat is already running) — see
// GAMEPLAY.md's "Hub -> race -> next-track flow".
Instance.OnScriptInput("hub_enter", ({ activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart) {
        Debug("hub_enter: activator wasn't a tracked melon, ignoring");
        return;
    }
    kart.inHub = true;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        ShowHubModal(slot);
    }
});

Instance.OnScriptInput("hub_leave", ({ activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart) {
        return;
    }
    kart.inHub = false;
    const slot = kart.pawn.GetPlayerController()?.GetPlayerSlot();
    if (slot !== undefined) {
        HideHubModal(slot);
    }
});

// See PAINT_TRIGGER_NAME_PATTERN above for the Hammer-side naming
// convention — the color comes from the trigger's own name, not this
// input's parameter, so any number of differently-colored triggers can
// share this one handler.
Instance.OnScriptInput("melon_paint", ({ caller, activator }) => {
    const kart = activator && FindKartByMelon(activator);
    if (!kart || !caller) {
        Debug("melon_paint: activator wasn't a tracked melon, ignoring");
        return;
    }
    const match = PAINT_TRIGGER_NAME_PATTERN.exec(caller.GetEntityName());
    if (!match) {
        Debug(`melon_paint: trigger "${caller.GetEntityName()}" doesn't match paint_trigger_<r>_<g>_<b>, ignoring`);
        return;
    }
    const [, r, g, b] = match.map(Number);
    kart.melon.SetColor({ r, g, b, a: 255 });
    Debug(`melon_paint: slot ${kart.pawn.GetPlayerController()?.GetPlayerSlot()} painted (${r}, ${g}, ${b})`);
});

Instance.OnCustomHudClicked((event) => {
    if (event.layout !== GetSpeedHud()) {
        return;
    }
    if (event.buttonId === "hub_start_button") {
        TryStartRace();
    } else if (event.buttonId === "hub_abort_button") {
        const slot = event.player.GetPlayerSlot();
        if (IsModerator(slot)) {
            TryAbortRace();
        } else {
            Debug(`hub_abort_button: slot ${slot} clicked but isn't the moderator, ignoring`);
        }
    }
});
