import { MODULE_ID } from "../constants";
import { DeathSaveOutcome } from "../types";
import { type Enricher } from "./shared";

type Message = {
  setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
  speaker?: { actor?: string | null };
  flags?: { dnd5e?: { roll?: { type?: string } } };
};

type ResolvedRoll = { parent?: Message };

type DeathSaveDetails = { chatString?: string; subject?: { id?: string } };

/** Terminal outcome only — `undefined` for an ongoing save (no flag stamped). */
function deathSaveOutcome(details: DeathSaveDetails): DeathSaveOutcome | undefined {
  // dnd5e sets chatString only for the terminal cases; that's exactly what we
  // want to surface (revive / stabilize / death). Ongoing success/failure has
  // no chatString and needs no flag — it's just total vs DC.
  const s = details.chatString ?? "";
  if (s.includes("CriticalSuccess")) return DeathSaveOutcome.Revived;
  if (s.includes("DeathSaveSuccess")) return DeathSaveOutcome.Stabilized;
  if (s.includes("DeathSaveFailure")) return DeathSaveOutcome.Dead;
  return undefined;
}

/** Foundry v13 doesn't back-reference the roll's message (`roll.parent` is v14+),
 *  so fall back to the death-save message dnd5e just created: the newest message
 *  carrying the death roll type for this actor. */
function findDeathMessage(subjectId: string | undefined): Message | undefined {
  const messages = (globalThis as { game?: { messages?: { contents?: Message[] } } }).game?.messages
    ?.contents;
  if (!messages) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.flags?.dnd5e?.roll?.type === "death" && (!subjectId || m.speaker?.actor === subjectId)) {
      return m;
    }
  }
  return undefined;
}

function onDeathSaveResolved(rolls: ResolvedRoll[], details: DeathSaveDetails): void {
  const outcome = deathSaveOutcome(details);
  if (!outcome) return;
  const message = rolls?.[0]?.parent ?? findDeathMessage(details.subject?.id);
  if (!message?.setFlag) return;
  // The roll message already exists by now; stamp the terminal outcome onto it.
  // This fires `updateChatMessage`, so the collector emits an `updated` event
  // carrying `flags["whatwerolled"].deathSave.outcome`.
  void message.setFlag(MODULE_ID, "deathSave", { outcome });
}

// Fired after a death save resolves — stamp the terminal outcome onto the message.
export const dnd5eRollDeathSaveV2: Enricher = {
  hook: "dnd5e.rollDeathSaveV2",
  handler: onDeathSaveResolved as (...args: unknown[]) => void,
};
