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

export type EnrichedPart = { source: string; value: number };

export type BuiltRollConfig = { parts?: unknown; data?: unknown };

export type RollConfig = {
  ability?: string;
  skill?: string;
  tool?: string;
  isConcentration?: boolean;
  subject?: {
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
  rolls?: BuiltRollConfig[];
};

export type MessageConfig = {
  data?: Record<string, unknown> & {
    flags?: Record<string, unknown> & {
      dnd5e?: { roll?: { type?: string } };
    };
  };
};

// For attacks, `rollConfig.subject` is the attack Activity (not the actor).
export type InvolvedItem = {
  id?: string;
  name?: string;
  system?: { type?: { baseItem?: string } };
};
export type AttackActivity = {
  ability?: string;
  attack?: { type?: { value?: string; classification?: string } };
  item?: InvolvedItem & { system?: { level?: number } };
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
