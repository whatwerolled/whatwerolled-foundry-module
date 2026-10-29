import { MODULE_ID } from "./constants";
import { itemsForPayload } from "./item-details";
import { MessageEventType, UserRole } from "./types";
import type {
  Author,
  ActorInfo,
  CollectedData,
  MessageEvent,
  Sender,
  WorldInfo,
  SystemInfo,
} from "./payload-types";

export { MessageEventType };
export type { Author, ActorInfo, MessageEvent };

const ROLE_BY_VALUE: readonly UserRole[] = [
  UserRole.None,
  UserRole.Player,
  UserRole.Trusted,
  UserRole.Assistant,
  UserRole.Gamemaster,
];

/** Mirror any message that carries rolls; the backend classifies the type. */
export function hasRolls(message: ChatMessage): boolean {
  return !!message.rolls?.length;
}

function authorOf(message: ChatMessage): Author | null {
  const source = message.toObject() as { author?: string | null };
  const id = source.author ?? null;
  if (!id) return null;
  const user = game?.users?.get(id);
  return {
    id,
    name: user?.name ?? "",
    role: ROLE_BY_VALUE[user?.role ?? 0] ?? UserRole.None,
  };
}

function senderOf(): Sender | null {
  const user = game?.user;
  if (!user?.id) return null;
  return { id: user.id, role: ROLE_BY_VALUE[user.role ?? 0] ?? UserRole.None };
}

function actorOf(message: ChatMessage): ActorInfo | null {
  const id = message.speaker?.actor ?? null;
  if (!id) return null;
  const actor = game?.actors?.get(id);
  // `name` is the shared actor template. When the speaker is a token, capture the
  // instance separately: its id (unique per token) + the display name from
  // `speaker.alias` (the token name, e.g. "Angry Phase Spider"). Foundry stores
  // both on the message, so they survive after the token/combat is gone.
  const tokenId = message.speaker?.token ?? null;
  return {
    id,
    name: actor?.name ?? "",
    token: tokenId
      ? {
          id: tokenId,
          name: message.speaker?.alias ?? "",
          ...linkedOf(message.speaker?.scene ?? null, tokenId),
        }
      : null,
  };
}

/** `{ linked }` for a token still on its scene, or `{}` when it is gone. */
function linkedOf(sceneId: string | null, tokenId: string): { linked?: boolean } {
  if (!sceneId) return {};
  const token = game?.scenes?.get(sceneId)?.tokens?.get(tokenId);
  return token ? { linked: !!token.actorLink } : {};
}

function worldOf(): WorldInfo {
  const w = game?.world;
  return {
    id: w?.id ?? "",
    title: w?.title ?? "",
  };
}

function systemOf(): SystemInfo {
  const s = game?.system;
  return {
    id: s?.id ?? "",
    version: s?.version ?? "",
  };
}

/** The raw Foundry data we mirror — flags (incl. our enricher's) pass through. */
function buildCollectedData(message: ChatMessage): CollectedData {
  const source = message.toObject() as {
    flags?: Record<string, unknown>;
    rolls?: string[];
    flavor?: string;
  };
  return {
    messageCreatedAt: new Date(message.timestamp),
    messageModifiedAt: new Date(message._stats.modifiedTime!),
    author: authorOf(message),
    sender: senderOf(),
    actor: actorOf(message),
    visibility: {
      whisper: (message.whisper ?? []) as string[],
      blind: message.blind ?? false,
    },
    world: worldOf(),
    system: systemOf(),
    module: { version: game?.modules?.get(MODULE_ID)?.version ?? "" },
    flavor: source.flavor ?? "",
    // Foundry's own flags pass through untouched; our own section gains the items the
    // system named for itself (pf2e). Descriptions are filled in afterwards — they
    // need to be read asynchronously. See item-details.ts.
    flags: itemsForPayload((source.flags ?? {}) as Record<string, unknown>, message),
    rolls: (source.rolls ?? []).map((r) => JSON.parse(r) as Record<string, unknown>),
  };
}

/** Build the wire event. The campaign is identified by the Bearer token, not the body. */
export function buildEvent(type: MessageEventType, message: ChatMessage): MessageEvent {
  if (!message.id) throw new Error(`${MODULE_ID} | ChatMessage delivered to hook without an id`);
  return {
    eventType: type,
    messageId: message.id,
    // A deletion only needs the id — nothing to collect.
    collectedData: type === MessageEventType.Deleted ? null : buildCollectedData(message),
  };
}
