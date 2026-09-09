import { MODULE_ID, Setting } from "./constants";
import { postCombat } from "./ingest";
import { CombatEventType, type CombatInfo, type CombatantInfo } from "./payload-types";

/**
 * Mirroring encounters.
 *
 * A fight produces no chat message, so none of it reaches the roll collector, and
 * `endCombat()` DELETES the document — Foundry keeps no history of it. What isn't
 * recorded as it happens is gone.
 *
 * Every event carries the encounter whole rather than a diff, so the backend can
 * record a fight it never saw begin, and a deletion still arrives with its contents.
 */

type Loose = Record<string, unknown>;

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/** Placeholder and wildcard art are not pictures — the roll path rejects the same. */
const usableArt = (src: unknown): string | undefined => {
  const path = str(src);
  return path && !path.includes("*") && path !== "icons/svg/mystery-man.svg" ? path : undefined;
};

function combatantInfo(combatant: Loose): CombatantInfo | undefined {
  const id = str(combatant.id);
  if (!id) return undefined;
  const token = combatant.token as
    | { id?: string; actorLink?: boolean; texture?: { src?: string } }
    | undefined;
  const source = combatant._source as { group?: string } | undefined;
  return {
    id,
    name: str(combatant.name) ?? "",
    img: usableArt(combatant.img) ?? usableArt(token?.texture?.src) ?? "",
    actorId: str((combatant.actor as { id?: string } | undefined)?.id) ?? null,
    tokenId: str(token?.id) ?? str(combatant.tokenId) ?? null,
    // The identity rule the rolls use: a linked token IS its actor, an unlinked one
    // is one of many. Absent when the token is already gone.
    ...(token ? { linked: !!token.actorLink } : {}),
    initiative: (combatant.initiative as number | null) ?? null,
    // Foundry's own answer, not the raw field: the field is only written by the
    // tracker's skull toggle, while a creature dropped by applying the Dead
    // condition is defeated everywhere in the game and would read as alive here.
    defeated: !!combatant.isDefeated,
    hidden: !!combatant.hidden,
    // From `_source`: the prepared field holds the group DOCUMENT, and reading the id
    // off it loses the group a deleted document leaves behind.
    ...(source?.group ? { group: source.group } : {}),
  };
}

function combatInfo(combat: Loose): CombatInfo | undefined {
  const id = str(combat.id);
  if (!id) return undefined;
  const scene = combat.scene as { id?: string; name?: string } | null | undefined;
  const created = (combat._stats as { createdTime?: number } | undefined)?.createdTime;
  // `turn` indexes `turns`, Foundry's SORTED order (`combat.turns[combat.turn]` is
  // whose turn it is) — NOT the combatants collection, which is in the order they
  // were added. Send the array the index actually points into: both systems we
  // support add their own initiative tiebreaks, so nobody downstream could redo
  // the sort. Before Foundry has sorted them there is no turn to point at either.
  const turns = [...((combat.turns as Iterable<Loose> | undefined) ?? [])];
  const combatants = turns.length
    ? turns
    : [...((combat.combatants as Iterable<Loose> | undefined) ?? [])];
  // On the way out Foundry has already nulled the live field (`_onDelete` runs
  // before the hook), and an encounter that ends is gone — so the turn it ended on
  // survives only in the source it was loaded with.
  const source = combat._source as { turn?: number | null } | undefined;
  return {
    id,
    name: str(combat.name) ?? "",
    active: !!combat.active,
    round: (combat.round as number) ?? 0,
    turn: (combat.turn as number | null) ?? source?.turn ?? null,
    started: !!combat.started,
    foundryCreatedAt: created ? new Date(created) : null,
    scene: scene?.id ? { id: scene.id, name: scene.name ?? "" } : null,
    combatants: combatants.map(combatantInfo).filter((c): c is CombatantInfo => !!c),
  };
}

function collect(type: CombatEventType, combat: Loose): void {
  try {
    if (!game.settings!.get(MODULE_ID, Setting.CollectEncounters)) return;
    const info = combatInfo(combat);
    if (!info) return;
    void postCombat({ eventType: type, combatId: info.id, combat: info });
  } catch (error) {
    // An encounter that ends is gone from the world, so losing that one silently
    // would lose the fight — say so rather than only dropping it.
    console.error(`${MODULE_ID} | could not report a combat ${type}`, error);
  }
}

/**
 * Round and turn changes also fire `combatRound`/`combatTurn`, but `updateCombat`
 * already covers them, and each event carries the whole encounter — so these four
 * hooks are enough. `combatStart` is deliberately NOT among them: core fires it
 * BEFORE the round/turn update it announces (`combat.mjs` startCombat), so its
 * encounter still reads as un-started; the update that follows tells the truth.
 *
 * Only the GM's client reports, so a table of five doesn't send five copies.
 */
export function captureCombats(): void {
  const on = Hooks.on.bind(Hooks) as (hook: string, fn: (...args: unknown[]) => void) => number;
  const gmOnly = (type: CombatEventType) => (combat: unknown) => {
    if (!game.user?.isActiveGM) return;
    collect(type, combat as Loose);
  };
  on("createCombat", gmOnly(CombatEventType.Created));
  on("updateCombat", gmOnly(CombatEventType.Updated));
  on("deleteCombat", gmOnly(CombatEventType.Ended));
}
