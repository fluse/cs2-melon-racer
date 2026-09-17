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

// How many checkpoints each track *actually* has, for the "3 / 8" HUD
// display — cs_script has no way to ask Hammer "how many checkpoint
// triggers with parameter checkpoint_<id>_* exist", so this has to be kept
// in sync by hand whenever checkpoints are added/removed/reordered on a
// track in Hammer. A track missing from this map shows "?" as its total
// instead of guessing.
/** @type {Record<number, number>} */
const TRACK_CHECKPOINT_COUNTS = {
    // 1: 8,
    // 2: 12,
};

// How far in front of (and above) the player to spawn their melon, so it
// doesn't spawn overlapping the player's own hitbox.
const SPAWN_FORWARD_OFFSET = 80;
const SPAWN_UP_OFFSET = 40;

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
 * }} Kart
 */
/** @type {Map<number, Kart>} */
const karts = new Map();

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
    const total = TRACK_CHECKPOINT_COUNTS[trackId];
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "current", String(kart.checkpointIndex));
    hud.SetDialogVariableStringForPlayer(slot, "checkpoint_panel", "total", total !== undefined ? String(total) : "?");
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
Instance.OnScriptReload({
    before: () => ({ karts }),
    after: (memory) => {
        if (memory?.karts) {
            for (const [slot, kart] of memory.karts) {
                karts.set(slot, kart);
            }
            Debug(`OnScriptReload: restored ${karts.size} kart(s)`);
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
});

// Checkpoints: place a trigger_multiple per checkpoint, filtered to the
// melon (prop_physics) so the frozen/parked pawn can't trigger it, with its
// OnStartTouch calling this point_script's RunScriptInput and a parameter of
// "checkpoint_<trackId>_<index>" — e.g. track 2's 3rd checkpoint is
// "checkpoint_2_3". The trigger's own position/angles become the respawn
// point if the melon breaks after reaching it.
//
// A kart isn't on any track until it touches a "_1" checkpoint, which
// (re)starts its progress on that track — this is how a racer picks/starts
// one of several tracks in the map, and how re-touching a track's first
// checkpoint later restarts a lap. Checkpoints past index 1 only count
// while the kart is already on that same track (so straying onto a
// different track's later checkpoints doesn't skip progress), and only ever
// move progress forward within it.
/** @param {number} trackId @param {number} index @param {Kart} kart @param {any} trigger */
function OnCheckpointTouched(trackId, index, kart, trigger) {
    if (index === 1) {
        kart.trackId = trackId;
        kart.checkpointIndex = 1;
    } else {
        if (kart.trackId !== trackId) {
            Debug(`checkpoint_${trackId}_${index}: kart is on track ${kart.trackId}, ignoring`);
            return;
        }
        if (index <= kart.checkpointIndex) {
            return;
        }
        kart.checkpointIndex = index;
    }
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
