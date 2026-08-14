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

type ParseNode = { class: string; operator?: string; term?: string; number?: number };

// Foundry resolves a reference as `@[-.\w]+`, hyphen included.
const WHOLE_REFERENCE = /^\s*([+-]?)\s*(@[-.\w]+)\s*$/;
const NUMERIC_LITERAL = /^[+-]?\d+(?:\.\d+)?$/;

/**
 * Cut a roll part into its additive segments, reading structure from Foundry's own
 * roll grammar rather than guessing at the string.
 *
 * D20 rolls hand over bare references (`@mod`, `@prof`), but damage and healing
 * arrive welded into one part — `2d8 + @mod`, `1 + @mod`, `@scale.monk.die + @mod`
 * — because dnd5e builds that string from the item's damage field. We parse WITHOUT
 * resolving data, which `Roll.parse` always does, so each `@`-reference survives as
 * a term instead of having already collapsed into a number.
 */
function additiveSegments(part: string): { sign: number; nodes: ParseNode[] }[] {
  // A part that IS one reference is taken as such, without the grammar. That's not
  // only a shortcut: the grammar treats `-` as an operator, so a hyphenated
  // reference would split into two halves that resolve to nothing — and real
  // content depends on them (a Barbarian's Rage adds `@scale.barbarian.rage-damage`
  // to its damage). It doubles as the fallback if a system replaces the parser.
  const whole = WHOLE_REFERENCE.exec(part);
  if (whole) {
    return [
      {
        sign: whole[1] === "-" ? -1 : 1,
        nodes: [{ class: "StringTerm", term: whole[2] }],
      },
    ];
  }
  const grammar = (
    globalThis as { foundry?: { dice?: { RollGrammar?: { parse(f: string): unknown } } } }
  ).foundry?.dice?.RollGrammar;
  const parser = (
    globalThis as { CONFIG?: { Dice?: { parser?: { flattenTree(n: unknown): ParseNode[] } } } }
  ).CONFIG?.Dice?.parser;
  if (!grammar || !parser) return [];
  const segments = [{ sign: 1, nodes: [] as ParseNode[] }];
  for (const node of parser.flattenTree(grammar.parse(part))) {
    if (node.class === "OperatorTerm" && (node.operator === "+" || node.operator === "-")) {
      segments.push({ sign: node.operator === "-" ? -1 : 1, nodes: [] });
    } else segments[segments.length - 1].nodes.push(node);
  }
  return segments;
}

/**
 * The reference a segment consists of, or nothing.
 *
 * A segment must BE the reference — one term, nothing beside it. Foundry never
 * folds an expression into a single term (`2 * @mod` stays `2`, `*`, `3`), and the
 * backend pairs a source with a term by its value, so attributing a product to the
 * reference inside it would label the multiplier and leave the real modifier bare.
 * Dice, parentheticals and function calls are excluded by the same rule.
 */
function referencedTerm(nodes: ParseNode[]): string | undefined {
  if (nodes.length !== 1) return undefined;
  const [node] = nodes;
  return node.class === "StringTerm" && node.term?.startsWith("@") ? node.term : undefined;
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
    let segments: { sign: number; nodes: ParseNode[] }[];
    try {
      segments = additiveSegments(raw);
    } catch {
      continue; // Unparseable formula — nothing to attribute.
    }
    for (const { sign, nodes } of segments) {
      const source = referencedTerm(nodes);
      if (!source) continue;
      try {
        const replaced = RollGlobal.replaceFormulaData(
          source,
          (data ?? {}) as Record<string, unknown>,
        ).trim();
        // A reference can resolve to an expression of its own (`@initiativeBonus`
        // becoming "6 * 2", `@prof` becoming "1d8"), which the Roll splits into
        // separate terms again — so only a plain number can be paired with one.
        // Zero counts: dnd5e leaves conditional add-ons in the formula (`@cover` on
        // a Dexterity save with no cover → +0) and the backend needs the source to
        // recognise those rather than showing an unlabeled +0.
        if (!NUMERIC_LITERAL.test(replaced)) continue;
        out.push({ source: normalizeSource(source, ability), value: sign * Number(replaced) });
      } catch {
        // Unresolvable reference — drop silently and keep going.
      }
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
