import { type AttributedPart } from "./shared";

/**
 * Turning a roll part into named sources.
 *
 * dnd5e collapses every `@`-reference into a plain number when a Roll evaluates, so
 * this runs while the config still holds the formula strings. Used by the postBuild
 * enricher (every dialog-driven roll) and by the initiative wrap, which has no hook.
 */

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

/** A resolved expression with no dice in it, as one number. */
export function deterministicValue(formula: string, RollGlobal: typeof Roll): number | undefined {
  if (NUMERIC_LITERAL.test(formula)) return Number(formula);
  try {
    const roll = new RollGlobal(formula);
    if (!roll.isDeterministic) return undefined;
    const total = roll.evaluateSync().total;
    return typeof total === "number" ? total : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The numbers a resolved reference contributes — one per term the roll will show.
 *
 * An Active Effect that ADDs to a bonus formula concatenates instead of summing: two
 * items each granting +1 to saves leave the field as "1 + 1", which the roll renders
 * as two terms. One source per term keeps each pairable with the term it produced,
 * and lets each carry its own item. Anything that isn't plain addition (`2 * 3`)
 * stays one value; dice contribute nothing.
 */
function resolvedValues(formula: string, RollGlobal: typeof Roll): number[] {
  const terms = formula.split(/(?=[+-])/).map((t) => t.replace(/\s+/g, ""));
  const pieces = terms.filter(Boolean).map((t) => (NUMERIC_LITERAL.test(t) ? Number(t) : NaN));
  if (pieces.length > 1 && !pieces.some(Number.isNaN)) return pieces;
  const total = deterministicValue(formula, RollGlobal);
  return total === undefined ? [] : [total];
}

/** An actor field whose own formula string dnd5e pushes into the roll as a part. */
export type LiteralField = { source: string; formula: string };

/** The plain numbers among a formula's additive terms — the `+2` of `2d4 + 2`. */
export function literalSegments(formula: string): number[] {
  const RollGlobal = (globalThis as { Roll?: typeof Roll }).Roll;
  if (!RollGlobal) return [];
  let segments: { sign: number; nodes: ParseNode[] }[];
  try {
    segments = additiveSegments(formula);
  } catch {
    return [];
  }
  const out: number[] = [];
  for (const { sign, nodes } of segments) {
    if (nodes.length !== 1) continue;
    const [node] = nodes;
    if (node.class !== "NumericTerm" || typeof node.number !== "number") continue;
    out.push(sign * node.number);
  }
  return out;
}

export function capturePartValues(
  parts: unknown,
  data: unknown,
  ability: string | undefined,
  literalFields: LiteralField[] = [],
): AttributedPart[] {
  if (!Array.isArray(parts)) return [];
  const RollGlobal = (globalThis as { Roll?: typeof Roll }).Roll;
  if (!RollGlobal) return [];
  const out: AttributedPart[] = [];
  const unclaimed = [...literalFields];
  for (const raw of parts) {
    if (typeof raw !== "string") continue;
    // A part with no reference in it may be a field dnd5e pushed verbatim (a
    // concentration or damage bonus). Match the string, not the number, and claim the
    // field so a second part with the same text can't be attributed to it twice.
    if (!raw.includes("@")) {
      const claimed = unclaimed.findIndex((f) => f.formula === raw.trim());
      if (claimed !== -1) {
        const [field] = unclaimed.splice(claimed, 1);
        for (const value of resolvedValues(raw.trim(), RollGlobal)) {
          out.push({ source: field.source, value });
        }
        continue;
      }
    }
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
        // A reference that resolves to dice (`@prof` becoming "1d8") has no single
        // value and is left out. Zero counts: dnd5e leaves conditional add-ons in the
        // formula (`@cover` on a Dexterity save with no cover → +0) and the backend
        // needs the source to recognise those rather than showing an unlabeled +0.
        for (const value of resolvedValues(replaced, RollGlobal)) {
          out.push({ source: normalizeSource(source, ability), value: sign * value });
        }
      } catch {
        // Unresolvable reference — drop silently and keep going.
      }
    }
  }
  return out;
}
