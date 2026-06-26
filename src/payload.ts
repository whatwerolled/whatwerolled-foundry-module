import { MODULE_ID } from "./constants";
import { MessageEventType, UserRole } from "./types";
import type {
  Author,
  ActorInfo,
  CollectedData,
  MessageEvent,
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

function absoluteUrl(path: string | null | undefined): string {
  if (!path) return "";
  return new URL(path, window.location.origin).href;
}

function authorOf(message: ChatMessage): Author | null {
  const source = message.toObject() as { author?: string | null };
  const id = source.author ?? null;
  if (!id) return null;
  const user = game?.users?.get(id);
  return {
    id,
    name: user?.name ?? "",
    avatar: absoluteUrl(user?.avatar),
    role: ROLE_BY_VALUE[user?.role ?? 0] ?? UserRole.None,
  };
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
    image: absoluteUrl(actor?.img),
    token: tokenId ? { id: tokenId, name: message.speaker?.alias ?? "" } : null,
  };
}

function worldOf(): WorldInfo {
  const w = game?.world;
  let image = "";
  for (const m of w?.media ?? []) {
    if (m.url) {
      image = absoluteUrl(m.url);
      break;
    }
  }
  return {
    id: w?.id ?? "",
    title: w?.title ?? "",
    image,
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
    author: authorOf(message),
    actor: actorOf(message),
    visibility: {
      whisper: (message.whisper ?? []) as string[],
      blind: message.blind ?? false,
    },
    world: worldOf(),
    system: systemOf(),
    flavor: source.flavor ?? "",
    flags: (source.flags ?? {}) as CollectedData["flags"],
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
