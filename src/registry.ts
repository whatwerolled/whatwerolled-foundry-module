import { MODULE_ID } from "./constants";
import type { MessageEvent } from "./payload-types";

/** One item as the registry describes it. Filled in as the payload is built. */
export type RegistryEntry = {
  name?: string;
  img?: string;
  uuid?: string;
  description?: string;
};

type Registry = Record<string, RegistryEntry>;

/**
 * Every copy of the item registry in one payload: the message's, and each roll's own.
 *
 * A module that re-homes rolls into its own message (RSReforged), and MIDI, leave the
 * message flag absent — the roll's own options are the only scope those tables have.
 * So anything filled in on the message copy alone reaches every table except theirs.
 *
 * The registries themselves, not a merged copy: callers fill entries in place.
 */
export function itemRegistries(event: MessageEvent): Registry[] {
  const data = event.collectedData;
  if (!data) return [];
  const scoped = (flags: unknown): Registry | undefined =>
    (flags as Record<string, { items?: Registry } | undefined> | undefined)?.[MODULE_ID]?.items;
  return [
    scoped(data.flags),
    ...data.rolls.map((roll) => scoped((roll as { options?: unknown }).options)),
  ].filter((registry): registry is Registry => !!registry);
}

/**
 * Each item id in the payload with every entry describing it, so a caller resolves an
 * item once and fills in all of its copies.
 */
export function itemEntriesById(event: MessageEvent): Map<string, RegistryEntry[]> {
  const byId = new Map<string, RegistryEntry[]>();
  for (const registry of itemRegistries(event)) {
    for (const [id, entry] of Object.entries(registry)) {
      const found = byId.get(id);
      if (found) found.push(entry);
      else byId.set(id, [entry]);
    }
  }
  return byId;
}
