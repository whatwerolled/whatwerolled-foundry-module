import { CAMPAIGN_ID_SETTINGS_KEY, INGEST_URL, MODULE_ID } from "./constants";
import type { MessageEvent } from "./payload";

/**
 * POST one event to the backend's fixed ingest endpoint. The campaign id is the
 * Bearer token (not sent in the body); a blank id disables upload.
 */
export async function postEvent(event: MessageEvent): Promise<void> {
  const campaignId = game.settings!.get(MODULE_ID, CAMPAIGN_ID_SETTINGS_KEY).trim();
  if (!campaignId) return;
  try {
    const res = await fetch(INGEST_URL, {
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
