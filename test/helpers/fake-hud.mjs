// A fake custom_hud_layout for engine-side tests: remembers, per player
// slot, which classes are set on which panel, the dialog variables and the
// input capture — the state the real layout would show that player.
import { Entity } from "./cs-script-mock.mjs";

export class FakeHud extends Entity {
    /** @param {string} name the layout's entity name (SPEED_HUD_ENTITY_NAME) */
    constructor(name) {
        super({ name, className: "custom_hud_layout" });
        /** @type {Map<string, boolean>} "slot/panel/class" -> on */
        this.classes = new Map();
        /** @type {Map<string, string>} "slot/panel/variable" -> value */
        this.variables = new Map();
        /** @type {Map<number, boolean>} */
        this.inputCapture = new Map();
    }
    SetHasClassForPlayer(slot, panel, cls, on) {
        this.classes.set(`${slot}/${panel}/${cls}`, on);
    }
    SetDialogVariableStringForPlayer(slot, panel, variable, value) {
        this.variables.set(`${slot}/${panel}/${variable}`, value);
    }
    SetInputCaptureEnabled(slot, enabled) {
        this.inputCapture.set(slot, enabled);
    }
    ResetForPlayer() {}
    /** Whether `cls` is set on `panel` for `slot` (undefined: never sent). @param {number} slot @param {string} panel @param {string} cls */
    Has(slot, panel, cls) {
        return this.classes.get(`${slot}/${panel}/${cls}`);
    }
    /** @param {number} slot @param {string} panel @param {string} variable */
    Variable(slot, panel, variable) {
        return this.variables.get(`${slot}/${panel}/${variable}`);
    }
}
