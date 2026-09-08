import { RollType } from "../types";
import {
  type AttackActivity,
  type Enricher,
  type MessageConfig,
  type RollConfig,
  mergeFlag,
  messageConfigByProcess,
  rollTypeFromConfig,
} from "./shared";
import { originalActorOf } from "./dnd5e.attribution";

const SUPPORTED_ROLL_TYPES: ReadonlySet<string> = new Set([
  RollType.Ability,
  RollType.Save,
  RollType.Skill,
  RollType.Tool,
  RollType.Death,
  RollType.Attack,
  RollType.Damage,
  RollType.Healing,
]);

function attackInfo(activity: AttackActivity): Record<string, unknown> {
  const type = activity.attack?.type;
  const info: Record<string, unknown> = {
    attackType: type?.value,
    classification: type?.classification,
  };
  // Spell attacks carry a cast level instead of a base weapon.
  if (type?.classification === "spell") info.spellLevel = activity.item?.system?.level;
  return info;
}

function onPreRoll(rollConfig: RollConfig, _dialog: unknown, messageConfig: MessageConfig): void {
  const rollType = rollTypeFromConfig(messageConfig);
  if (!rollType || !SUPPORTED_ROLL_TYPES.has(rollType)) return;
  messageConfigByProcess.set(rollConfig, messageConfig);

  // A roll made in a new form: the form's own actor speaks, so record who it is
  // really. See originalActorOf.
  const original = originalActorOf(rollConfig);
  if (original) mergeFlag(messageConfig, { originalActor: original });

  // dnd5e tags concentration as a plain "save"; only `rollConfig.isConcentration`
  // reveals the truth, and only at roll time. Record the resolved rollType now —
  // the collector honours it instead of re-deriving "save".
  if (rollConfig.isConcentration) mergeFlag(messageConfig, { rollType: RollType.Concentration });

  // Melee / ranged / spell / unarmed, which the card distinguishes and the message
  // itself doesn't say. The items involved are recorded by postBuild, which sees the
  // ammunition and the bonus sources too.
  if (rollType === RollType.Attack) {
    mergeFlag(messageConfig, {
      attack: attackInfo(rollConfig.subject as unknown as AttackActivity),
    });
  }
}

// Stash the messageConfig at preRoll (only hook that has it in scope). We
// subscribe to the generic-suffix-less hook so one handler covers every roll
// type that includes "" in hookNames (basic-roll adds it).
export const dnd5ePreRollV2: Enricher = {
  hook: "dnd5e.preRollV2",
  handler: onPreRoll as (...args: unknown[]) => void,
};
