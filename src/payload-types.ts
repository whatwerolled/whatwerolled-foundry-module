import type { MessageEventType, UserRole } from "./types";

// The wire shapes the collector builds and sends. The module only *produces*
// these — it never reads or validates an incoming payload — so plain TS types
// are enough here. Runtime validation (zod) lives with the consumers (e2e suite
// and backend), not in the shipped module.

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

/**
 * One combatant, as the encounter saw it.
 *
 * `name` is the combatant's own display name (a token's, usually), which is what the
 * table read off the tracker. `actorId` / `tokenId` / `linked` are the same identity
 * the roll payload carries, so a combatant lines up with the character who rolled.
 * `group` is Foundry v14's combatant grouping (several tokens acting on one
 * initiative), by group id.
 */
export type CombatantInfo = {
  id: string;
  name: string;
  img: string;
  actorId: string | null;
  tokenId: string | null;
  linked?: boolean;
  initiative: number | null;
  defeated: boolean;
  hidden: boolean;
  group?: string;
};

/**
 * An encounter as it stands right now. Sent whole with every combat event, so the
 * backend can record an encounter it never saw begin — a GM who turns collection on
 * mid-fight, or a module release landing mid-session.
 *
 * `foundryCreatedAt` is the encounter's own creation time in the world; the backend
 * keeps its own arrival time separately, since the two answer different questions.
 * `scene` travels for context and is deliberately not something the backend stores.
 */
export type CombatInfo = {
  id: string;
  name: string;
  active: boolean;
  round: number;
  turn: number | null;
  started: boolean;
  foundryCreatedAt: Date | null;
  scene: { id: string; name: string } | null;
  combatants: CombatantInfo[];
};

export enum CombatEventType {
  Created = "created",
  Updated = "updated",
  Ended = "ended",
}

export type CombatEvent = {
  eventType: CombatEventType;
  combatId: string;
  combat: CombatInfo;
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
