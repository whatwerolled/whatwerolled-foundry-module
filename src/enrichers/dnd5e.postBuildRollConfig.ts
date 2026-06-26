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
  const messageConfig = messageConfigByProcess.get(rollConfig);
  if (!messageConfig) return;

  // For skill / tool checks dnd5e stamps the chosen ability (which may have
  // been overridden in the dropdown) onto the per-roll `data.abilityId`,
  // not back onto `rollConfig.ability`. Prefer the per-roll value. Attacks keep
  // the ability on the activity (rollConfig.subject) — so `@mod` normalizes.
  const data = builtConfig.data as { abilityId?: string } | undefined;
  const rollType = rollTypeFromConfig(messageConfig);
  const ability =
    data?.abilityId ??
    rollConfig.ability ??
    (rollType === RollType.Attack || rollType === RollType.Damage
      ? (rollConfig.subject as unknown as AttackActivity).ability
      : undefined);

  const parts = capturePartValues(builtConfig.parts, builtConfig.data, ability);
  if (parts.length === 0) return;

  // Preserve rolls already captured for other indices in the same message.
  const existing = getFlag(messageConfig).rolls;
  const rollsList = (existing as Array<{ parts: EnrichedPart[] }> | undefined) ?? [];
  rollsList[index] = { parts };

  const patch: Record<string, unknown> = { rolls: rollsList };
  if (ability) patch.ability = ability;

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
