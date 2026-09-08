import { MODULE_ID, Setting } from "./constants";
import { registerEnrichers } from "./enrichers";
import { captureRollTableDraws } from "./roll-table";
import { buildEvent, hasRolls, MessageEventType } from "./payload";
import { postEvent } from "./ingest";
import { attachActorImage } from "./image-sync";
import { attachItemDescriptions } from "./item-details";
import { captureCombats } from "./combat";

async function collect(type: MessageEventType, message: ChatMessage): Promise<void> {
  if (!game.settings!.get(MODULE_ID, Setting.CollectRolls)) return;
  const event = buildEvent(type, message);
  // Enrichment reads far more of the world than the message itself — items, effects,
  // compendia, a canvas for the pictures — and any of it can throw on data we have
  // never seen. None of that is worth losing the roll over, so the mirror goes out
  // with whatever was gathered by the time something broke.
  if (type !== MessageEventType.Deleted) {
    try {
      await attachItemDescriptions(event, message);
      await attachActorImage(event, message);
    } catch (error) {
      console.error(`${MODULE_ID} | enrichment failed; sending the roll as-is`, error);
    }
  }
  await postEvent(event);
}

function registerSwitch(key: Setting, name: string, hint: string): void {
  game.settings!.register(MODULE_ID, key, {
    name,
    hint,
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}

Hooks.once("init", () => {
  game.settings!.register(MODULE_ID, Setting.CampaignId, {
    name: "Campaign ID",
    hint: "Get it from your campaign page at app.whatwerolled.com (open a campaign, copy its Campaign ID). Without it, your rolls won't be collected.",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });
  registerSwitch(
    Setting.CollectRolls,
    "Collect rolls",
    "Send the rolls made in this world to your campaign. Turn this off and no roll leaves the table.",
  );
  registerSwitch(
    Setting.CollectEncounters,
    "Collect combat encounters",
    "Send each encounter: who took part, the order they acted in, and how it played out.",
  );
  registerEnrichers();
  captureRollTableDraws();
});

Hooks.once("ready", () => {
  captureCombats();
  Hooks.on("createChatMessage", (message) => {
    if (!hasRolls(message)) return;
    void collect(MessageEventType.Created, message);
  });
  Hooks.on("updateChatMessage", (message) => {
    if (!hasRolls(message)) return;
    void collect(MessageEventType.Updated, message);
  });
  Hooks.on("deleteChatMessage", (message) => {
    if (!hasRolls(message)) return;
    void collect(MessageEventType.Deleted, message);
  });
});
