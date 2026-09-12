import type { MessageEventType, UserRole } from "./types";

// The wire shapes the collector builds and sends. The module only *produces*
// these — it never reads or validates an incoming payload — so plain TS types are
// enough here; runtime validation belongs to whoever receives them.

export type Author = {
  id: string;
  name: string;
  avatar: string;
  role: UserRole;
};

// The specific token instance that rolled — present when the speaker is a token.
// `id` is the unique per-token key; `name` is the token's display name (e.g.
// "Miserable Adult Red Dragon"). `linked` is Foundry's `token.actorLink` — the
// backend needs it to decide whether the actor or the token is the identity;
// absent when the token is already gone.
type TokenInfo = {
  id: string;
  name: string;
  linked?: boolean;
};

export type ActorInfo = {
  id: string;
  name: string;
  image: string;
  token: TokenInfo | null;
};

export type ImageEntry = { dataBase64: string } | { sourceUrl: string };

/**
 * The pictures behind one roll.
 *
 * `actor` is the character's portrait — who they are. `token` is what stood on the
 * table for this roll, which is not the same thing: an unlinked token carries art of
 * its own, so six goblins from one template can each look different, and a token can
 * be dressed for a scene without the character's portrait changing. `items` is keyed
 * by item id, matching the `items` section of our flag.
 */
export type Images = {
  actor?: ImageEntry;
  token?: ImageEntry;
  items?: Record<string, ImageEntry>;
};

type Visibility = {
  whisper: string[];
  blind: boolean;
};

export type WorldInfo = {
  id: string;
  title: string;
  image: string;
};

export type SystemInfo = {
  id: string;
  version: string;
};

export type ModuleInfo = {
  version: string;
};

// What the collector mirrors off the ChatMessage. dnd5e/core flags pass through
// untouched alongside our own `whatwerolled` enrichment flag, so `flags` stays a
// loose bag — the backend interprets it.
export type CollectedData = {
  messageCreatedAt: Date;
  author: Author | null;
  actor: ActorInfo | null;
  visibility: Visibility;
  world: WorldInfo;
  system: SystemInfo;
  module: ModuleInfo;
  flavor: string;
  flags: Record<string, unknown>;
  rolls: Record<string, unknown>[];
};

// Wire envelope: identity + what happened. `collectedData` is null for deletions
// (the backend only needs the id to drop the row). The campaign is identified by
// the Bearer token, not carried in the body.
export type MessageEvent = {
  eventType: MessageEventType;
  messageId: string;
  collectedData: CollectedData | null;
  images?: Images;
};
