// Minimal in-process fake of the engine's "cs_script/point_script" module —
// just enough for the engine-side files in src/ to load and for tests to
// drive specific functions with fake entities. Not a simulation: traces
// hit nothing unless a test sets world.traceLine/traceSphere, Delay() resolves on the next microtask (its
// seconds recorded in world.delays), EntFireAtTarget/EntFireAtName calls are recorded in world.fired, and every
// Instance.OnXxx/SetXxx registration is only recorded (see `world.handlers`).
//
// Tests set up the world through `world` (exported below): add entities
// with world.add(...), then look at what the code under test did to them.

export const CSInputs = new Proxy({}, { get: (_, key) => String(key) });
export const CSMoveType = new Proxy({}, { get: (_, key) => String(key) });
export const CustomCameraMode = { DISABLED: 0, CONTROLLED: 1, CONTROLLED_POSITION: 2, FOLLOW_POSITION: 3 };

const clone = (v) => (v ? { ...v } : v);

export class Entity {
    /** @param {{ name?: string, className?: string, origin?: any, angles?: any }} [o] */
    constructor({ name = "", className = "info_target", origin = { x: 0, y: 0, z: 0 }, angles = { pitch: 0, yaw: 0, roll: 0 } } = {}) {
        this.name = name;
        this.className = className;
        this.origin = clone(origin);
        this.angles = clone(angles);
        this.velocity = { x: 0, y: 0, z: 0 };
        this.valid = true;
        this.color = undefined;
    }
    GetEntityName() { return this.name; }
    GetClassName() { return this.className; }
    GetAbsOrigin() { return clone(this.origin); }
    GetAbsAngles() { return clone(this.angles); }
    GetAbsVelocity() { return clone(this.velocity); }
    IsValid() { return this.valid; }
    IsWorld() { return false; }
    Teleport({ position, angles, velocity } = {}) {
        if (position) this.origin = clone(position);
        if (angles) this.angles = clone(angles);
        if (velocity) this.velocity = clone(velocity);
    }
    Move(values = {}) { this.Teleport(values); }
    Remove() { this.valid = false; }
    Kill() { this.valid = false; }
    SetColor(color) { this.color = clone(color); }
    SetHealth(h) { this.health = h; }
    SetMaxHealth(h) { this.maxHealth = h; }
    GetHealth() { return this.health ?? 0; }
    GetMaxHealth() { return this.maxHealth ?? 0; }
    SetMoveType(t) { this.moveType = t; }
    SetParent(parent) { this.parent = parent; }
    GetParent() { return this.parent; }
}

/** A player pawn: its eye angles are what Teleport({ angles }) changes, like the engine's. */
export class CSPlayerPawn extends Entity {
    /** @param {{ slot: number, eyeAngles?: any }} o */
    constructor({ slot, eyeAngles = { pitch: 0, yaw: 0, roll: 0 }, team = 3 }) {
        super({ className: "player" });
        this.slot = slot;
        this.team = team;
        this.alive = true;
        this.eyeAngles = clone(eyeAngles);
        /** @type {Set<string>} buttons held (CSInputs names, e.g. "FORWARD") */
        this.pressed = new Set();
        /** @type {Set<string>} buttons pressed this tick (e.g. "JUMP") */
        this.justPressed = new Set();
        this.camera = { mode: 0, config: undefined, SetMode(m) { this.mode = m; }, GetMode() { return this.mode; }, SetFollowConfig(c) { this.config = c; } };
    }
    Teleport(values = {}) {
        super.Teleport(values);
        if (values.angles) this.eyeAngles = clone(values.angles);
    }
    GetEyeAngles() { return clone(this.eyeAngles); }
    GetPlayerController() { return { GetPlayerSlot: () => this.slot }; }
    GetTeamNumber() { return this.team; }
    IsAlive() { return this.alive; }
    GetCustomCamera() { return this.camera; }
    IsInputPressed(button) { return this.pressed.has(button); }
    WasInputJustPressed(button) { return this.justPressed.has(button); }
}

export class PointTemplate extends Entity {
    /**
     * Like the engine, ForceSpawn keeps each entity's offset from the
     * template: the origin `spawn` gives an entity is that offset.
     * @param {{ name: string, spawn: () => Entity[] }} o
     */
    constructor({ name, spawn }) {
        super({ name, className: "point_template" });
        this.spawn = spawn;
    }
    ForceSpawn(origin, angles) {
        const spawned = this.spawn();
        for (const e of spawned) {
            const o = origin ?? { x: 0, y: 0, z: 0 };
            e.Teleport({ position: { x: o.x + e.origin.x, y: o.y + e.origin.y, z: o.z + e.origin.z }, angles });
            world.add(e);
        }
        return spawned;
    }
}

export const world = {
    time: 0,
    /** @type {Entity[]} */
    entities: [],
    /** @type {Record<string, any[]>} everything registered through Instance.OnXxx/SetXxx, by method name */
    handlers: {},
    /** @type {string[]} */
    messages: [],
    /** Every EntFireAtTarget/EntFireAtName call's argument. @type {any[]} */
    fired: [],
    /** Seconds passed to each Instance.Delay call. @type {number[]} */
    delays: [],
    /** What GetAllPlayerControllers returns: one fake controller per pawn listed here. @type {CSPlayerPawn[]} */
    playerPawns: [],
    /** Optional overrides for what traces hit: (config) => TraceResult. Default: nothing is ever hit. */
    traceLine: undefined,
    traceSphere: undefined,
    /** Every Instance.DebugLine call's argument. @type {any[]} */
    debugLines: [],
    /** @template {Entity} T @param {T} e @returns {T} */
    add(e) { this.entities.push(e); return e; },
    reset() { this.time = 0; this.entities = []; this.playerPawns = []; this.messages = []; this.fired = []; this.delays = []; this.traceLine = undefined; this.traceSphere = undefined; this.debugLines = []; },
};

const noHit = (config) => ({ didHit: false, startedInSolid: false, end: clone(config.end), normal: { x: 0, y: 0, z: 1 }, fraction: 1 });

const instanceMethods = {
    GetGameTime: () => world.time,
    Msg: (text) => { world.messages.push(String(text)); },
    FindEntityByName: (name) => world.entities.find((e) => e.valid && e.name === name),
    FindEntitiesByName: (name) => world.entities.filter((e) => e.valid && e.name === name),
    FindEntityByClass: (cls) => world.entities.find((e) => e.valid && e.className === cls),
    FindEntitiesByClass: (cls) => world.entities.filter((e) => e.valid && e.className === cls),
    TraceLine: (c) => (world.traceLine ?? noHit)(c),
    TraceSphere: (c) => (world.traceSphere ?? noHit)(c),
    TraceBox: noHit,
    Delay: (seconds) => { world.delays.push(seconds); return Promise.resolve(); },
    EntFireAtTarget: (args) => { world.fired.push(args); },
    EntFireAtName: (args) => { world.fired.push(args); },
    DebugLine: (args) => { world.debugLines.push(args); },
    DebugSphere: () => {},
    DebugBox: () => {},
    DebugScreenText: () => {},
    GetPlayerController: () => undefined,
    GetAllPlayerControllers: () => world.playerPawns.map((pawn) => ({
        IsConnected: () => true,
        GetPlayerSlot: () => pawn.slot,
        GetPlayerPawn: () => pawn,
    })),
};

/** Known methods behave as above; anything else (OnScriptInput, SetThink, ...) just records its arguments. */
export const Instance = new Proxy(instanceMethods, {
    get(target, key) {
        if (key in target) {
            return target[key];
        }
        return (...args) => {
            (world.handlers[key] ??= []).push(args);
        };
    },
});
