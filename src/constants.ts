export const MODULE_ID = "whatwerolled" as const;

export const INGEST_URL = "https://app.whatwerolled.com/api/foundry-ingest" as const;

/** Never rename a value: it is the key a world's stored setting is under. */
export enum Setting {
  CampaignId = "campaignId",
  CollectRolls = "collectRolls",
}
