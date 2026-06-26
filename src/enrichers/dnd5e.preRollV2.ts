import { RollType } from "../types";
import {
  type AttackActivity,
  type Enricher,
  type InvolvedItem,
  type MessageConfig,
  type RollConfig,
  getFlag,
  mergeFlag,
  messageConfigByProcess,
  rollTypeFromConfig,
} from "./shared";

const SUPPORTED_ROLL_TYPES: ReadonlySet<string> = new Set([
  RollType.Ability,
  RollType.Save,
  RollType.Skill,
  RollType.Tool,
  RollType.Death,
  RollType.Attack,
  RollType.Damage,
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

// Intrinsic metadata for an item involved in the roll. The `items` section is a
// map keyed by item id so several items (weapon + a bonus-granting item, …) can
// all be referenced from one message; later enriched with description / image.
function itemEntry(item: InvolvedItem): Record<string, unknown> {
  const entry: Record<string, unknown> = { name: item.name };
  const baseItem = item.system?.type?.baseItem;
  if (baseItem !== undefined) entry.baseItem = baseItem;
  return entry;
}

function mergeItem(messageConfig: MessageConfig, item: InvolvedItem | undefined): void {
  if (!item?.id) return;
  const items = (getFlag(messageConfig).items as Record<string, unknown>) ?? {};
  items[item.id] = itemEntry(item);
  mergeFlag(messageConfig, { items });
}

function onPreRoll(rollConfig: RollConfig, _dialog: unknown, messageConfig: MessageConfig): void {
  const rollType = rollTypeFromConfig(messageConfig);
  if (!rollType || !SUPPORTED_ROLL_TYPES.has(rollType)) return;
  messageConfigByProcess.set(rollConfig, messageConfig);

  // dnd5e tags concentration as a plain "save"; only `rollConfig.isConcentration`
  // reveals the truth, and only at roll time. Record the resolved rollType now —
  // the collector honours it instead of re-deriving "save".
  if (rollConfig.isConcentration) mergeFlag(messageConfig, { rollType: RollType.Concentration });

  // Attack metadata the frontend needs to distinguish melee/ranged/spell/unarmed
  // and label the weapon. uuid/type are already in flags.dnd5e.item.
  // Attack and damage both ride an activity that knows its item; reference it in
  // the shared `items` map. Attack adds its melee/ranged/spell metadata on top.
  if (rollType === RollType.Attack || rollType === RollType.Damage) {
    const activity = rollConfig.subject as unknown as AttackActivity;
    if (rollType === RollType.Attack) mergeFlag(messageConfig, { attack: attackInfo(activity) });
    mergeItem(messageConfig, activity.item);
  }
}

// Stash the messageConfig at preRoll (only hook that has it in scope). We
// subscribe to the generic-suffix-less hook so one handler covers every roll
// type that includes "" in hookNames (basic-roll adds it).
export const dnd5ePreRollV2: Enricher = {
  hook: "dnd5e.preRollV2",
  handler: onPreRoll as (...args: unknown[]) => void,
};
