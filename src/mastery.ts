import { MODULE_ID } from "./constants";
import { ENRICH_BUDGET_MS } from "./item-details";
import type { MessageEvent } from "./payload";

/**
 * The rule behind a weapon mastery.
 *
 * dnd5e records a mastery on the roll as a bare slug (`vex`), and the rest lives in
 * `CONFIG.DND5E.weaponMasteries` — a localized label plus a `reference` uuid pointing
 * at the mastery's page in the rules compendium. Neither reaches the app on its own:
 * the slug is not a name, and the reference is a uuid only this world can resolve.
 *
 * So the label and the rule's text travel with the roll, the same way an item's
 * description does. A mastery is deliberately NOT recorded as an entity: it is a rule,
 * identical at every table and curated by nobody, so there is no version history to
 * keep and nothing to merge.
 */

type MasteryConfig = { label?: string; reference?: string };

const MAX_RULE = 1200;

/** Every mastery the message's rolls used. dnd5e puts it on each roll's options. */
function masteryIds(message: ChatMessage): string[] {
  const rolls =
    (message as unknown as { rolls?: { options?: { mastery?: string } }[] }).rolls ?? [];
  const ids = rolls.map((r) => r?.options?.mastery).filter((m): m is string => !!m);
  return [...new Set(ids)];
}

function configFor(id: string): MasteryConfig | undefined {
  const masteries = (
    globalThis as { CONFIG?: { DND5E?: { weaponMasteries?: Record<string, MasteryConfig> } } }
  ).CONFIG?.DND5E?.weaponMasteries;
  return masteries?.[id];
}

export async function attachMasteries(event: MessageEvent, message: ChatMessage): Promise<void> {
  const ids = masteryIds(message);
  if (!ids.length) return;

  const enricher = foundry.applications.ux.TextEditor.implementation;
  const flatten = document.createElement("div");
  const out: Record<string, { label: string; description?: string }> = {};
  // The rule's page can come out of a cold compendium, and the POST waits behind
  // this — so the same budget the descriptions get. Past it the labels still go.
  const deadline = Date.now() + ENRICH_BUDGET_MS;

  for (const id of ids) {
    const config = configFor(id);
    // No config means a mastery this world added without one; the app still has the
    // slug, so leave it rather than inventing a label for it.
    if (!config?.label) continue;
    const entry: { label: string; description?: string } = { label: config.label };
    if (config.reference && Date.now() < deadline) {
      try {
        const page = (await foundry.utils.fromUuid(config.reference)) as {
          text?: { content?: string };
        } | null;
        const raw = page?.text?.content;
        if (raw) {
          flatten.innerHTML = await enricher.enrichHTML(raw, { secrets: false });
          const text = (flatten.textContent ?? "").replace(/\s+/g, " ").trim();
          if (text) entry.description = text.slice(0, MAX_RULE);
        }
      } catch {
        // The label alone is still worth sending.
      }
    }
    out[id] = entry;
  }
  if (!Object.keys(out).length) return;

  const flags = (event.collectedData?.flags ?? {}) as Record<string, Record<string, unknown>>;
  flags[MODULE_ID] = { ...flags[MODULE_ID], masteries: out };
  if (event.collectedData) event.collectedData.flags = flags as never;
}
