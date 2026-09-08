import { COMBAT_URL, INGEST_URL, MODULE_ID, Setting } from "./constants";
import type { MessageEvent } from "./payload";
import type { CombatEvent } from "./payload-types";

/**
 * POST one event to the backend's fixed ingest endpoint. The campaign id is the
 * Bearer token (not sent in the body); a blank id disables upload.
 */
export async function postEvent(
  event: MessageEvent | CombatEvent,
  url: string = INGEST_URL,
): Promise<void> {
  const campaignId = game.settings!.get(MODULE_ID, Setting.CampaignId).trim();
  if (!campaignId) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${campaignId}`,
      },
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`${MODULE_ID} | ingest ${res.status}`, detail);
    }
  } catch (error) {
    console.error(`${MODULE_ID} | ingest error`, error);
  }
}

/** Encounters go to their own endpoint — a combat is not a chat message. */
export const postCombat = (event: CombatEvent): Promise<void> => postEvent(event, COMBAT_URL);
