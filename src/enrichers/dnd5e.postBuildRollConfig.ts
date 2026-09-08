import { MODULE_ID } from "../constants";
import { RollType } from "../types";
import {
  type AttackActivity,
  type BuiltRollConfig,
  type AttributedPart,
  type DiceSource,
  type EnrichedPart,
  type ItemRef,
  type Enricher,
  type RollConfig,
  getFlag,
  itemEntries,
  mergeFlag,
  mergeItems,
  messageConfigByProcess,
  rollTypeFromConfig,
} from "./shared";
import { capturePartValues, literalSegments, type LiteralField } from "./parts";
import { literalActorFields, type PathContext } from "./dnd5e.paths";
import {
  ammunitionRef,
  attributeFieldParts,
  attributeItemParts,
  diceFromItemEffects,
  castVesselOf,
  rollingItemOf,
} from "./dnd5e.attribution";

function pathContext(rollConfig: RollConfig, ability: string | undefined): PathContext {
  return {
    ability,
    skill: rollConfig.skill,
    tool: rollConfig.tool,
    actionType: rollConfig.subject?.getActionType?.(rollConfig.attackMode),
  };
}

const isDamage = (rollType: string | undefined): boolean =>
  rollType === RollType.Damage || rollType === RollType.Healing;

/**
 * The literal-pushed fields for this roll, with each field's current formula.
 *
 * Only the FIRST damage part: dnd5e appends the actor's damage bonus once, to part
 * index 0 (`base-activity.mjs` _processDamagePart), so claiming it against a later
 * part would credit a second part that happens to read the same to the wrong source.
 */
function literalFields(
  rollConfig: RollConfig,
  rollType: string | undefined,
  ctx: PathContext,
  index: number,
): LiteralField[] {
  const actor = rollConfig.subject?.actor ?? rollConfig.subject;
  if (!actor || (isDamage(rollType) && index !== 0)) return [];
  const fields: LiteralField[] = [];
  for (const source of literalActorFields(rollType, ctx)) {
    const raw = foundry.utils.getProperty(actor as object, source);
    const formula = typeof raw === "number" ? String(raw) : (raw as string | undefined)?.trim();
    if (formula) fields.push({ source, formula });
  }
  return fields;
}

/**
 * The constants in a damage or healing roll's own formula, credited to the item.
 *
 * A Potion of Healing is `2d4 + 2`: that +2 is the potion's, not a bonus the drinker
 * has. dnd5e puts the item's own formula first (`base-activity.mjs` _processDamagePart
 * builds `parts = [scaledFormula]` before appending anything) — but only when the item
 * HAS one: with no base formula, part 0 is the actor's damage bonus instead, which is
 * already claimed as a field and must not be credited to the item as well.
 */
function ownFormulaParts(
  rollConfig: RollConfig,
  builtConfig: BuiltRollConfig,
  rollType: string | undefined,
  claimable: LiteralField[],
  index: number,
): AttributedPart[] {
  if (!isDamage(rollType) || index !== 0) return [];
  const base = Array.isArray(builtConfig.parts) ? builtConfig.parts[0] : undefined;
  if (typeof base !== "string" || base.includes("@")) return [];
  if (claimable.some((field) => field.formula === base.trim())) return [];
  const item = rollingItemOf(rollConfig);
  return literalSegments(base).map((value) => ({
    source: "damage.base",
    value,
    ...(item ? { from: [item] } : {}),
  }));
}

function proficiencyMultiplier(
  rollConfig: RollConfig,
  rollType: string,
  ability: string | undefined,
): number | undefined {
  const system = rollConfig.subject?.system;
  if (!system) return undefined;
  // Always emit (including 0) so the backend has a consistent signal: 0 ⇒
  // not proficient, 0.5 ⇒ half, 1 ⇒ proficient, 2 ⇒ expertise.
  if (rollType === RollType.Skill && rollConfig.skill) {
    return system.skills?.[rollConfig.skill]?.value ?? 0;
  }
  if (rollType === RollType.Tool && rollConfig.tool) {
    return system.tools?.[rollConfig.tool]?.value ?? 0;
  }
  if (rollType === RollType.Save && ability) {
    return system.abilities?.[ability]?.saveProf?.multiplier ?? 0;
  }
  if (rollType === RollType.Ability && ability) {
    return system.abilities?.[ability]?.checkProf?.multiplier ?? 0;
  }
  return undefined;
}

function onPostBuild(rollConfig: RollConfig, builtConfig: BuiltRollConfig, index: number): void {
  // For skill / tool checks dnd5e stamps the chosen ability (which may have
  // been overridden in the dropdown) onto the per-roll `data.abilityId`,
  // not back onto `rollConfig.ability`. Prefer the per-roll value. Attacks/damage
  // keep the ability on the activity (rollConfig.subject) — so `@mod` normalizes.
  const data = builtConfig.data as { abilityId?: string } | undefined;
  const ability =
    data?.abilityId ??
    rollConfig.ability ??
    (rollConfig.subject as unknown as AttackActivity | undefined)?.ability;

  const messageConfig = messageConfigByProcess.get(rollConfig);
  // dnd5e's own roll type, or ours where we know better than it does — a
  // concentration save is a plain "save" to dnd5e, and its bonus field is a different
  // one, so reading only dnd5e's answer would never claim it.
  const rollType = messageConfig
    ? ((getFlag(messageConfig).rollType as string | undefined) ?? rollTypeFromConfig(messageConfig))
    : undefined;
  const ctx = pathContext(rollConfig, ability);
  const claimable = literalFields(rollConfig, rollType, ctx, index);
  const captured = capturePartValues(builtConfig.parts, builtConfig.data, ability, claimable);
  // No flat modifiers is not nothing to record: a Fireball is 8d6, and the spell and
  // the wand it came out of still are.
  const parts = attributeItemParts(
    [
      ...attributeFieldParts(captured, rollConfig.subject, builtConfig.data, ctx),
      ...ownFormulaParts(rollConfig, builtConfig, rollType, claimable, index),
    ],
    rollConfig,
  );

  // Dice an enchantment adds belong to the roll that actually rolls them: the item's
  // damage. Stamping them on an attack — or on a second damage part, or a recharge of
  // the same item — would claim dice that roll never contained.
  const vessel = castVesselOf(rollConfig);
  const dice = isDamage(rollType) && index === 0 ? diceFromItemEffects(rollConfig) : [];
  const referenced: ItemRef[] = [
    rollingItemOf(rollConfig),
    ammunitionRef(rollConfig),
    vessel,
    ...parts.flatMap((p) => p.from ?? []),
    ...dice.flatMap((d) => d.from ?? []),
  ].filter((ref): ref is ItemRef => !!ref);
  const byId = <T extends { from?: ItemRef[] }>({ from, ...rest }: T) =>
    from ? { ...rest, from: from.map((r) => r.id) } : rest;
  const wireParts: EnrichedPart[] = parts.map(byId);
  const wireDice: DiceSource[] = dice.map(byId);

  // Stamp onto the roll's OWN options. dnd5e builds the Roll from this config
  // (`new Roll(formula, config.data, config.options)`) and a Roll serialises its
  // options, so the breakdown travels WITH the roll — which is what lets a module
  // that re-homes rolls into its own message (RSReforged rolls with `create: false`
  // and injects the Rolls) keep its sources. That scope carries its own `items`,
  // since no message flag of ours reaches it.
  if (wireParts.length || wireDice.length) {
    builtConfig.options ??= {};
    builtConfig.options[MODULE_ID] = {
      parts: wireParts,
      ...(wireDice.length ? { dice: wireDice } : {}),
      ...(referenced.length ? { items: itemEntries(referenced) } : {}),
    };
  }

  // Message-level enrichment needs the messageConfig linked at preRoll — absent for a
  // re-homed roll, where the roll.options above already carries the breakdown.
  if (!messageConfig) return;

  const patch: Record<string, unknown> = {};
  if (wireParts.length || wireDice.length) {
    // Preserve rolls already captured for other indices in the same message.
    const existing = getFlag(messageConfig).rolls;
    const rollsList =
      (existing as Array<{ parts: EnrichedPart[]; dice?: DiceSource[] }> | undefined) ?? [];
    rollsList[index] = { parts: wireParts, ...(wireDice.length ? { dice: wireDice } : {}) };
    patch.rolls = rollsList;
  }
  if (ability) patch.ability = ability;

  // The message's own registry: every item this roll touched, described once and
  // referred to by id from the breakdown.
  mergeItems(messageConfig, referenced);
  if (vessel) patch.castFrom = vessel.id;

  if (rollType) {
    const profMul = proficiencyMultiplier(rollConfig, rollType, ability);
    if (profMul !== undefined) patch.profMultiplier = profMul;
  }

  mergeFlag(messageConfig, patch);
}

// Fired per-roll after the dialog builds the config. Parts are populated by then
// for every D20-driven roll type (ability check, save, skill, tool).
export const dnd5ePostBuildRollConfig: Enricher = {
  hook: "dnd5e.postBuildRollConfig",
  handler: onPostBuild as (...args: unknown[]) => void,
};
