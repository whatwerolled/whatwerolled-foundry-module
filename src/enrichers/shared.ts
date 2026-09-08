import { MODULE_ID } from "../constants";

/**
 * Shared plumbing for the per-hook enrichers.
 *
 * dnd5e collapses `@`-references (`@abilities.dex.mod`, `@prof`, etc.) into plain
 * numbers when a Roll evaluates, so labelled term breakdowns are unrecoverable
 * from a finished ChatMessage. The enrichers sit on dnd5e roll hooks and stamp
 * the resolved sources onto `messageConfig.data.flags[MODULE_ID]` before the
 * message persists; the collector ships the flag through unchanged.
 *
 * Why a WeakMap: the part values only exist on `postBuildRollConfig` (per built
 * roll, after the dialog populates `parts`), but only `preRollV2` has the
 * `messageConfig` in scope. We link the two via `messageConfigByProcess`, keyed
 * by the shared `rollConfig` object.
 */

/** One enricher = one dnd5e hook + its handler. `index.ts` registers the set. */
export type Enricher = {
  hook: string;
  handler: (...args: unknown[]) => void;
};

/**
 * An item that took part in a roll: enough to read the card without asking Foundry,
 * since the app can't dereference a Foundry id and the item may be gone by then.
 * `kind` is our system-agnostic bucket (weapon / spell / feature / …), `type` the
 * system's own (`feat`, `equipment`).
 */
export type ItemRef = {
  id: string;
  name: string;
  img?: string;
  kind?: string;
  type?: string;
  /** dnd5e's base weapon behind a specific one — a "Vicious Longbow" is a longbow. */
  baseItem?: string;
};

/**
 * A named modifier, with the items that granted it.
 *
 * `from` holds item ids, not the items: an item can be behind several modifiers and
 * appear in several roles, so it is described once in the roll's `items` and referred
 * to by id everywhere else.
 */
export type EnrichedPart = { source: string; value: number; from?: string[] };

/** Dice a roll gained from somewhere other than its own formula — an enchantment
 *  adding `2d6`. `effect` names the enchantment, `from` the item ids carrying it. */
export type DiceSource = {
  source: string;
  formula: string;
  effect?: string;
  from?: string[];
};

/** The same, as attribution works them out: the items themselves, before they are
 *  put in the registry and replaced by their ids. */
export type AttributedPart = Omit<EnrichedPart, "from"> & { from?: ItemRef[] };
export type AttributedDice = Omit<DiceSource, "from"> & { from?: ItemRef[] };

export type BuiltRollConfig = {
  parts?: unknown;
  data?: unknown;
  options?: Record<string, unknown>;
};

export type RollConfig = {
  ability?: string;
  skill?: string;
  tool?: string;
  isConcentration?: boolean;
  /** Chosen in the attack dialog; decides which action-type bonuses apply. */
  attackMode?: string;
  subject?: {
    // An attack/damage roll's subject is the Activity, which owns the actor; a
    // d20 test's subject IS the actor.
    actor?: unknown;
    getActionType?: (attackMode?: string) => string | undefined;
    system?: {
      skills?: Record<string, { value?: number } | undefined>;
      tools?: Record<string, { value?: number } | undefined>;
      abilities?: Record<
        string,
        | {
            saveProf?: { multiplier?: number };
            checkProf?: { multiplier?: number };
          }
        | undefined
      >;
    };
  };
};

export type MessageConfig = {
  data?: Record<string, unknown> & {
    // Deliberately narrow: our own flag must be written under the DOTTED key (see
    // FLAG_KEY below), never nested here, so this shape doesn't accept it.
    flags?: { dnd5e?: { roll?: { type?: string } } };
  };
};

export type AttackActivity = {
  ability?: string;
  attack?: { type?: { value?: string; classification?: string } };
  item?: { id?: string; name?: string; system?: { level?: number } };
};

/** Links preRoll's `messageConfig` to postBuild, keyed by the shared rollConfig. */
export const messageConfigByProcess = new WeakMap<RollConfig, MessageConfig>();

/**
 * dnd5e mostly nests the roll flag (`data.flags.dnd5e.roll`), but hit-die rolls
 * stash it under the flattened key `"flags.dnd5e.roll"` (expanded later). Read
 * both so every roll type is recognised at preroll time.
 */
export function rollTypeFromConfig(messageConfig: MessageConfig): string | undefined {
  const data = messageConfig?.data;
  const nested = data?.flags?.dnd5e?.roll?.type;
  if (nested) return nested;
  const flat = (data?.["flags.dnd5e.roll"] as { type?: string } | undefined)?.type;
  return flat;
}

// Write our flag under the flattened key dnd5e itself uses (`"flags.dnd5e.roll"`)
// rather than a nested `data.flags` object. dnd5e calls `expandObject(data)`
// before persisting; a literal nested `flags` key inserted alongside dnd5e's
// dotted key gets clobbered when expandObject replaces `flags` wholesale.
// Dotted keys merge via setProperty, so both flags survive.
const FLAG_KEY = `flags.${MODULE_ID}`;

export function getFlag(messageConfig: MessageConfig): Record<string, unknown> {
  return (messageConfig?.data?.[FLAG_KEY] as Record<string, unknown>) ?? {};
}

/** Merge a patch into our flag on the outgoing message config. */
export function mergeFlag(messageConfig: MessageConfig, patch: Record<string, unknown>): void {
  messageConfig.data ??= {};
  messageConfig.data[FLAG_KEY] = { ...getFlag(messageConfig), ...patch };
}

/**
 * Record the items that took part in the roll, keyed by id.
 *
 * Identity only — name, picture, kind. The description is left to the collector: it
 * is large, it would sit in the world's own message forever, and it is the same text
 * on every roll. An item can appear in several roles at once (the weapon that rolled
 * also granting the bonus), and keying by id keeps one entry per item.
 */
export function mergeItems(messageConfig: MessageConfig, refs: (ItemRef | undefined)[]): void {
  const items = { ...((getFlag(messageConfig).items as Record<string, unknown>) ?? {}) };
  const entries = itemEntries(refs);
  if (!Object.keys(entries).length) return;
  for (const [id, entry] of Object.entries(entries)) {
    items[id] = { ...(items[id] as object | undefined), ...entry };
  }
  mergeFlag(messageConfig, { items });
}

/** Items keyed by id, as the payload carries them. */
export function itemEntries(refs: (ItemRef | undefined)[]): Record<string, Omit<ItemRef, "id">> {
  const out: Record<string, Omit<ItemRef, "id">> = {};
  for (const ref of refs) {
    if (!ref) continue;
    const { id, ...rest } = ref;
    out[id] = { ...out[id], ...rest };
  }
  return out;
}
