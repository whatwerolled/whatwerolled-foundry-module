export const MODULE_ID = "whatwerolled" as const;

export const INGEST_URL = "https://app.whatwerolled.com/api/foundry-ingest" as const;

export const SETTLE_MS = { gm: 1000, player: 5000 } as const;

/** Never rename a value: it is the key a world's stored setting is under. */
export enum Setting {
  CampaignId = "campaignId",
  CollectRolls = "collectRolls",
}
