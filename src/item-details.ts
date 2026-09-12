import { MODULE_ID } from "./constants";
import { kindOf } from "./kinds";
import { itemEntriesById } from "./registry";
import { proseFrom } from "./prose";
import type { MessageEvent } from "./payload-types";

/**
 * The item information the app can't get for itself, added as the payload is built.
 *
 * A roll that says only `qdxxGDu9tguu68Fu` is unreadable, and the app can't ask
 * Foundry — so an item's name, picture and description all travel with the roll that
 * used it. `system.description.value` is the path in dnd5e and in pf2e alike; a
 * GM-only description (pf2e's `description.gm`) is never read.
 */

type ItemLike = {
  id?: string;
  _id?: string;
  name?: string;
  img?: string;
  type?: string;
  system?: {
    identified?: boolean;
    description?: { value?: unknown };
    unidentified?: { description?: unknown };
  };
};
type ItemEntry = Record<string, unknown>;
type OurFlag = { items?: Record<string, ItemEntry> };

/**
 * Items a roll points at that our own enrichment didn't record.
 *
 * pf2e works out its own modifier breakdown and names the item behind each modifier
 * as a uuid (`modifiers[].source`), plus the item the roll came from (`origin.uuid`).
 * Those are the same items we record by hand under dnd5e, so rather than rebuild
 * pf2e's work we resolve its uuids into the same registry — the app can't dereference
 * a uuid any more than an id.
 *
 * Read under the active system's own scope: sf2e is a pf2e fork and writes the very
 * same shape under `flags.sf2e`, so keying on `game.system.id` covers both.
 */
function foreignItems(message: ChatMessage): Record<string, ItemEntry> {
  const systemId = game?.system?.id;
  const flags = systemId
    ? (
        message as unknown as {
          flags?: Record<
            string,
            | {
                origin?: { uuid?: string } | null;
                modifiers?: { source?: string | null }[];
              }
            | undefined
          >;
        }
      ).flags?.[systemId]
    : undefined;
  if (!flags) return {};
  const uuids = [flags.origin?.uuid, ...(flags.modifiers ?? []).map((m) => m.source)].filter(
    (u): u is string => typeof u === "string",
  );

  const out: Record<string, ItemEntry> = {};
  for (const uuid of new Set(uuids)) {
    // `strict: false` or this throws for an embedded document inside a compendium —
    // which is what pf2e writes for a bestiary-granted effect — and a throw here
    // would take the whole roll down with it. A compendium uuid comes back as an
    // index record, which carries `_id` rather than `id`, so both are read; a uuid
    // that resolves to nothing is skipped, and pf2e's own labels still describe the
    // modifier.
    const item = foundry.utils.fromUuidSync(uuid, { strict: false }) as ItemLike | null;
    const id = item?.id ?? item?._id;
    if (!item || !id) continue;
    const kind = kindOf(item.type);
    out[id] = {
      name: item.name ?? "",
      uuid,
      ...(item.img ? { img: item.img } : {}),
      ...(item.type ? { type: item.type } : {}),
      ...(kind ? { kind } : {}),
    };
  }
  return out;
}

/**
 * The description a PLAYER would read.
 *
 * dnd5e keeps an unidentified item's real text in `description.value` and shows
 * `unidentified.description` instead until it is identified — the swap is a read-time
 * decision (`item-data-model.mjs` embeddedDescriptionKeyPath), not a stored one. Read
 * naively, an unidentified magic item would arrive in the app with its secret intact.
 * The GM's own privilege is deliberately NOT honoured here: the app shows the table.
 */
function descriptionFor(item: ItemLike | undefined): unknown {
  const system = item?.system;
  if (system?.identified === false) return system.unidentified?.description;
  return system?.description?.value;
}

/** Ammunition consumed to nothing is deleted, and dnd5e keeps a copy of it on the
 *  message — but it sets that flag AFTER the message exists (`attack.mjs`), so the
 *  copy only reaches us when the message is re-ingested as an update. */
function destroyedItem(message: ChatMessage, itemId: string): ItemLike | undefined {
  const data = (
    message as unknown as {
      flags?: { dnd5e?: { roll?: { ammunitionData?: { _id?: string } & ItemLike } } };
    }
  ).flags?.dnd5e?.roll?.ammunitionData;
  return data?._id === itemId ? data : undefined;
}

/**
 * The actor that rolled, as the roll saw it.
 *
 * For an unlinked token that is the token's own actor, not the one in the sidebar:
 * they share an id, but the token's copy carries the items the GM changed on it, and
 * `game.actors.get()` would hand back the shared original.
 */
function speakingActor(message: ChatMessage): { items?: { get(id: string): unknown } } | undefined {
  const speaker = message.speaker as { scene?: string; token?: string; actor?: string };
  const token =
    speaker?.scene && speaker?.token
      ? game?.scenes?.get(speaker.scene)?.tokens?.get(speaker.token)
      : undefined;
  const fromToken = (token as unknown as { actor?: { items?: { get(id: string): unknown } } })
    ?.actor;
  return fromToken ?? (speaker?.actor ? (game?.actors?.get(speaker.actor) as never) : undefined);
}

function findItem(message: ChatMessage, itemId: string): ItemLike | undefined {
  const owned = speakingActor(message)?.items?.get(itemId) as ItemLike | undefined;
  return (
    owned ?? (game?.items?.get(itemId) as ItemLike | undefined) ?? destroyedItem(message, itemId)
  );
}

export function itemsForPayload(
  flags: Record<string, unknown>,
  message: ChatMessage,
): Record<string, unknown> {
  const ours = (flags[MODULE_ID] as OurFlag | undefined) ?? {};
  let foreign: Record<string, ItemEntry> = {};
  try {
    foreign = foreignItems(message);
  } catch (error) {
    // This runs inside the payload build, which nothing above it guards: a throw
    // here would discard the roll rather than one item's identity.
    console.error(`${MODULE_ID} | could not resolve the system's own items`, error);
  }
  const items = { ...foreign, ...ours.items };
  if (!Object.keys(items).length) return flags;
  return { ...flags, [MODULE_ID]: { ...ours, items } };
}

/** A whole roll's descriptions are worth a moment, never a wait: enrichment can
 *  fetch compendium documents, and the POST is behind it. */
export const ENRICH_BUDGET_MS = 3000;

/** Enough for any item card; a homebrew item can hold an essay, and every roll that
 *  used it would carry the whole thing. */
const MAX_DESCRIPTION = 2000;

/**
 * Fill in each item's description as plain text (see `prose.ts` for what that means
 * and what it leaves out). Rendering is async, which is why this sits alongside the
 * images rather than in the payload build.
 */
export async function attachItemDescriptions(
  event: MessageEvent,
  message: ChatMessage,
): Promise<void> {
  // Every scope's copy of an item, filled in together: a re-homed roll (RSReforged,
  // MIDI) carries its own registry and no message flag, so writing only the message's
  // copy leaves those tables with a bare name.
  const byId = itemEntriesById(event);
  if (!byId.size) return;

  const deadline = Date.now() + ENRICH_BUDGET_MS;
  for (const [id, entries] of byId) {
    if (Date.now() > deadline) return;
    // A `uuid` is here when the system named the item rather than us, and an id alone
    // can't find those: a compendium item is not on the actor and not in the sidebar.
    const uuid = entries.find((e) => e.uuid)?.uuid;
    const item = uuid
      ? ((foundry.utils.fromUuidSync(String(uuid), { strict: false }) as ItemLike | null) ??
        undefined)
      : findItem(message, id);
    const raw = descriptionFor(item);
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const text = await proseFrom(raw, MAX_DESCRIPTION, item);
      if (text) for (const entry of entries) entry.description = text;
    } catch {
      // Leave the item without a description rather than send unrendered markup.
    }
  }
}
