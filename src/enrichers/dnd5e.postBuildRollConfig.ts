import { MODULE_ID } from "../constants";
import { RollType } from "../types";
import {
  type AttackActivity,
  type BuiltRollConfig,
  type EnrichedPart,
  type Enricher,
  type RollConfig,
  getFlag,
  mergeFlag,
  messageConfigByProcess,
  rollTypeFromConfig,
} from "./shared";

function normalizeSource(raw: string, ability: string | undefined): string {
  const trimmed = raw.trim();
  // dnd5e uses `@mod` as a short form for the current ability's modifier.
  // Resolve to the long form so the backend doesn't need context.
  if (ability) return trimmed.replace(/^@mod\b/i, `@abilities.${ability}.mod`);
  return trimmed;
}

function capturePartValues(
  parts: unknown,
  data: unknown,
  ability: string | undefined,
): EnrichedPart[] {
  if (!Array.isArray(parts)) return [];
  const RollGlobal = (globalThis as { Roll?: typeof Roll }).Roll;
  if (!RollGlobal) return [];
  const out: EnrichedPart[] = [];
  for (const raw of parts) {
    if (typeof raw !== "string") continue;
    // Skip pure dice tokens (`1d20`, `2d6kh1`, …) — already in the persisted Roll.
    if (/^\s*\d*d\d+(\s|$|[+\-*/])/i.test(raw)) continue;
    try {
      const replaced = RollGlobal.replaceFormulaData(raw, (data ?? {}) as Record<string, unknown>);
      const value = RollGlobal.safeEval(replaced);
      if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
        out.push({ source: normalizeSource(raw, ability), value });
      }
    } catch {
      // Unevaluable formula — drop silently and keep going.
    }
  }
  return out;
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

  const parts = capturePartValues(builtConfig.parts, builtConfig.data, ability);
  if (parts.length === 0) return;

  // Stamp the parts onto the roll's OWN options. dnd5e builds the Roll from this
  // config (`new Roll(formula, config.data, config.options)`) and a Roll serialises
  // its options, so the breakdown travels WITH the roll. This is what lets modules
  // that re-home rolls into their own message — RSReforged rolls attack/damage with
  // `create: false` and injects the Roll objects into one combined message — still
  // carry per-roll sources; the frontend reads them off each roll regardless of how
  // the rolls are grouped. Done before the messageConfig step so it doesn't depend
  // on the (throwaway) message config such a module hands dnd5e.
  builtConfig.options ??= {};
  builtConfig.options[MODULE_ID] = { parts };

  // Message-level enrichment for the message dnd5e itself creates (the standard
  // path): the per-roll parts plus the rollType override / profMultiplier / ability.
  // Needs the messageConfig linked at preRoll — absent for a re-homed roll, where the
  // roll.options above already carries the breakdown.
  const messageConfig = messageConfigByProcess.get(rollConfig);
  if (!messageConfig) return;

  // Preserve rolls already captured for other indices in the same message.
  const existing = getFlag(messageConfig).rolls;
  const rollsList = (existing as Array<{ parts: EnrichedPart[] }> | undefined) ?? [];
  rollsList[index] = { parts };

  const patch: Record<string, unknown> = { rolls: rollsList };
  if (ability) patch.ability = ability;

  const rollType = rollTypeFromConfig(messageConfig);
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
