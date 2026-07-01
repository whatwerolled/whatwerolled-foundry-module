import { CAMPAIGN_ID_SETTINGS_KEY, MODULE_ID } from "./constants";
import { registerEnrichers } from "./enrichers";
import { buildEvent, hasRolls, MessageEventType } from "./payload";
import { postEvent } from "./ingest";

Hooks.once("init", () => {
  game.settings!.register(MODULE_ID, CAMPAIGN_ID_SETTINGS_KEY, {
    name: "Campaign ID",
    hint: "Get it from your campaign page at app.whatwerolled.com (open a campaign, copy its Campaign ID). Without it, your rolls won't be collected.",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
  registerEnrichers();
});

Hooks.once("ready", () => {
  Hooks.on("createChatMessage", (message) => {
    if (!hasRolls(message)) return;
    void postEvent(buildEvent(MessageEventType.Created, message));
  });
  Hooks.on("updateChatMessage", (message) => {
    if (!hasRolls(message)) return;
    void postEvent(buildEvent(MessageEventType.Updated, message));
  });
  Hooks.on("deleteChatMessage", (message) => {
    if (!hasRolls(message)) return;
    void postEvent(buildEvent(MessageEventType.Deleted, message));
  });
});
