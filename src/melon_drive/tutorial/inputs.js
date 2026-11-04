// Script inputs of the tutorial stations: tutorial_enter/tutorial_leave on a
// station trigger (tutorial_station_<id>), tutorial_goal on a goal trigger
// (tutorial_goal_<id>_<goal>). Which one comes from the trigger's name.
import { Instance, Console } from "cs_script/point_script";
import { FindKartByMelon } from "../core/kart-registry.js";
import { StationFromTriggerName, GoalFromTriggerName } from "./logic.js";
import { EnterTutorialStation, LeaveTutorialStation, ReachTutorialGoal } from "./tutorial.js";

/** @param {string} input @param {(kart: any, name: string) => void} handle */
function OnMelonInput(input, handle) {
    Instance.OnScriptInput(input, ({ caller, activator }) => {
        const kart = activator && FindKartByMelon(activator);
        if (kart && caller) {
            handle(kart, caller.GetEntityName());
        }
    });
}

export function RegisterTutorialInputs() {
    OnMelonInput("tutorial_enter", (kart, name) => {
        const id = StationFromTriggerName(name);
        if (id === undefined) {
            Console.Log(`[melon_drive] tutorial_enter: trigger "${name}" isn't named tutorial_station_<1..6>, ignoring`);
            return;
        }
        EnterTutorialStation(kart, id);
    });
    OnMelonInput("tutorial_leave", (kart, name) => {
        const id = StationFromTriggerName(name);
        if (id !== undefined) {
            LeaveTutorialStation(kart, id);
        }
    });
    OnMelonInput("tutorial_goal", (kart, name) => {
        const goal = GoalFromTriggerName(name);
        if (!goal) {
            Console.Log(`[melon_drive] tutorial_goal: trigger "${name}" isn't named tutorial_goal_<station>_<goal>, ignoring`);
            return;
        }
        ReachTutorialGoal(kart, goal.station, goal.goal);
    });
}
