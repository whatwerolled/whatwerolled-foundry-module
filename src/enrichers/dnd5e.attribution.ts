import { type AttributedPart, type ItemRef } from "./shared";
import { kindOf } from "../kinds";
import { deterministicValue } from "./parts";
import { actorFieldForSource, type PathContext } from "./dnd5e.paths";

/**
 * Only additions can be read as "this item gave +N" — dnd5e's own attribution counts
 * the same, and a MULTIPLY or OVERRIDE has no such answer.
 *
 * Both spellings are accepted because v14 is mid-migration: changes gained a string
 * `type` and the numeric `mode` became a deprecated shim (`CONST.ACTIVE_EFFECT_MODES`
 * is deprecated since 14, removed in 16), while the module still supports v13, where
 * only `mode` exists.
 */
const isAddition = (change: Change): boolean => change.type === "add" || change.mode === 2;

type Change = { key?: string; mode?: number; type?: string; value?: string };
type EffectLike = {
  name?: string;
  disabled?: boolean;
  isSuppressed?: boolean;
  changes?: Change[];
  parent?: { documentName?: string; id?: string; name?: string; img?: string; type?: string };
};
type ActorLike = {
  _source?: object;
  allApplicableEffects?: () => Iterable<EffectLike>;
};

/** An item as a payload entry. An id is required; a name is not — an item without one
 *  still travels, because its id is what a modifier refers to. */
export function itemRef(item: {
  id?: string;
  name?: string;
  img?: string;
  type?: string;
  system?: { type?: { baseItem?: string } };
}): ItemRef | undefined {
  if (!item?.id) return undefined;
  const kind = kindOf(item.type);
  const baseItem = item.system?.type?.baseItem;
  return {
    id: item.id,
    name: item.name ?? "",
    ...(item.img ? { img: item.img } : {}),
    ...(item.type ? { type: item.type } : {}),
    ...(kind ? { kind } : {}),
    ...(baseItem ? { baseItem } : {}),
  };
}

type Contribution = { value: number; item?: ItemRef };

/**
 * What the actor's own data and each Active Effect contribute to one bonus field.
 *
 * dnd5e's rule (`Actor5e#_prepareActiveEffectAttributions`) minus its legacy-key
 * shim: the change's key must equal the field exactly — never a guess from the value —
 * and its mode must be ADD. An effect written against a legacy key is therefore
 * counted by dnd5e and missed here, which the count check below turns into "nothing
 * attributed" rather than a wrong name. The base is the actor's stored value before
 * any effect, read from `_source`, so the pieces sum to what the roll used.
 */
function contributionsForField(actor: ActorLike, field: string, rollData: unknown): Contribution[] {
  const RollGlobal = (globalThis as { Roll?: typeof Roll }).Roll;
  if (!RollGlobal) return [];
  const resolve = (formula: string): number | undefined =>
    deterministicValue(
      RollGlobal.replaceFormulaData(formula, (rollData ?? {}) as Record<string, unknown>).trim(),
      RollGlobal,
    );

  const out: Contribution[] = [];
  // The actor's own value, before any effect — resolved against the roll's data like
  // the effects are, since a bonus field may itself be written as a reference.
  const base = foundry.utils.getProperty(actor._source ?? {}, field);
  const baseValue = typeof base === "number" ? base : resolve(String(base ?? "").trim());
  if (baseValue) out.push({ value: baseValue });

  for (const effect of actor.allApplicableEffects?.() ?? []) {
    if (effect.disabled || effect.isSuppressed) continue;
    for (const change of effect.changes ?? []) {
      if (change.key !== field || !isAddition(change)) continue;
      const value = resolve(String(change.value ?? ""));
      if (!value) continue;
      // An item's own effect names the item; an effect living on the actor has no
      // item behind it (a condition, a GM-applied buff) and stays unattributed.
      const parent = effect.parent;
      out.push({
        value,
        ...(parent?.documentName === "Item" ? { item: itemRef(parent) } : {}),
      });
    }
  }
  return out;
}

const sum = (ns: { value: number }[]): number => ns.reduce((n, x) => n + x.value, 0);

/**
 * Which item a modifier belongs to when the item IS the source — no effects involved.
 *
 * dnd5e builds these in `attack-data.mjs` (getAttackData / _processDamagePart), so the
 * reference name is enough to know whose bonus it is:
 *   `@weaponMagic` / `@magicalBonus` → the rolling item's own magic bonus
 *   `@bonus`                         → the ACTIVITY's attack bonus, credited to the
 *                                      item it lives on (two activities on one item
 *                                      are indistinguishable here)
 *   `@ammoMagic` / `@ammoBonus`      → the ammunition
 *
 * A flat attack emits `@toHit` instead and is in neither set, so it stays unnamed.
 */
const ITEM_SOURCES = new Set(["@weaponMagic", "@magicalBonus", "@bonus"]);
const AMMO_SOURCES = new Set(["@ammoMagic", "@ammoBonus"]);

type AmmoHolder = {
  ammunition?: unknown;
  subject?: {
    item?: Parameters<typeof itemRef>[0];
    actor?: {
      items?: {
        get(id: string): Parameters<typeof itemRef>[0] | undefined;
      };
    };
  };
};

type AmmoItem = Parameters<typeof itemRef>[0] & {
  system?: { damage?: { replace?: boolean; base?: { formula?: string } } };
};

/** The ammunition of this roll: dnd5e keeps the item itself on a damage config and its
 *  id on an attack's, so accept either. */
function ammunitionItem(rollConfig: AmmoHolder): AmmoItem | undefined {
  const ammo = rollConfig.ammunition;
  if (ammo && typeof ammo === "object") return ammo as AmmoItem;
  if (typeof ammo === "string") return rollConfig.subject?.actor?.items?.get(ammo) as AmmoItem;
  return undefined;
}

function ammunitionOf(rollConfig: AmmoHolder): ItemRef | undefined {
  return itemRef(ammunitionItem(rollConfig) ?? {});
}

/**
 * Whether the ammunition's own damage REPLACED the weapon's, rather than being added
 * after it.
 *
 * dnd5e splices the ammunition's base damage into the weapon's slot when the ammo is
 * set to replace (`attack-data.mjs` getDamageConfig), and nothing on the built roll
 * says it happened. Without asking, the formula in that slot — the ammunition's — is
 * credited to the weapon, naming an item that granted none of it.
 */
export function ammunitionReplacesBase(rollConfig: unknown): boolean {
  const ammo = ammunitionItem(rollConfig as AmmoHolder)?.system?.damage;
  return !!ammo?.replace && !!ammo.base?.formula;
}

/** Which ability an actor's initiative uses — its own, or the game's default. Both
 *  initiative paths resolve it here so the two can't disagree. */
export function initiativeAbility(subject: unknown): string | undefined {
  const actor = subject as
    | { system?: { attributes?: { init?: { ability?: string } } } }
    | undefined;
  return (
    actor?.system?.attributes?.init?.ability ||
    (CONFIG as { DND5E?: { defaultAbilities?: { initiative?: string } } }).DND5E?.defaultAbilities
      ?.initiative
  );
}

/**
 * The item a spell was cast FROM, when it wasn't cast from the caster's own list.
 *
 * A scroll or wand casts through dnd5e's Cast activity, which creates a copy of the
 * spell on the actor and rolls that (`cast.mjs`) — so the roll reports the spell as
 * its item and the scroll appears nowhere. The copy keeps `cachedFor`, a relative
 * uuid of the activity that made it, which names the vessel.
 */
export function castVesselOf(rollConfig: unknown): ItemRef | undefined {
  const holder = rollConfig as {
    subject?: {
      item?: { getFlag?: (scope: string, key: string) => unknown };
      actor?: { items?: { get(id: string): { id?: string } | undefined } };
    };
  };
  const cachedFor = holder.subject?.item?.getFlag?.("dnd5e", "cachedFor");
  if (typeof cachedFor !== "string") return undefined;
  const itemId = /^\.Item\.([^.]+)\./.exec(cachedFor)?.[1];
  if (!itemId) return undefined;
  return itemRef(holder.subject?.actor?.items?.get(itemId) ?? {});
}

/**
 * The character behind a new form.
 *
 * dnd5e's transform CREATES A NEW ACTOR for the form (`actor.mjs` transformInto), so
 * a druid in wild shape rolls under the bear's id and nothing in the message leads
 * back to the druid — only `flags.dnd5e.originalActor` on the new actor does. The roll
 * should still read as the bear, which is what the table saw; this is what lets the
 * card also say whose bear it is.
 */
export function originalActorOf(rollConfig: unknown): ItemRef | undefined {
  const holder = rollConfig as {
    subject?: { actor?: unknown } & { flags?: unknown };
  };
  const actor = (holder.subject?.actor ?? holder.subject) as
    | { flags?: { dnd5e?: { originalActor?: string; isPolymorphed?: boolean } } }
    | undefined;
  const flags = actor?.flags?.dnd5e;
  if (!flags?.isPolymorphed || !flags.originalActor) return undefined;
  const original = game?.actors?.get(flags.originalActor) as
    | { id?: string; name?: string; img?: string }
    | undefined;
  return original?.id
    ? { id: original.id, name: original.name ?? "", ...(original.img ? { img: original.img } : {}) }
    : { id: flags.originalActor, name: "" };
}

/**
 * The item the roll itself came from — the weapon swung, the spell cast, the breath
 * weapon recharging.
 *
 * Usually the roll's subject is an Activity, which knows its item. A recharge's
 * subject is the ITEM for item-level uses and the Activity for activity-level ones
 * (`uses-field.mjs` rollRecharge), so accept either — neither branch is dead.
 */
export function rollingItemOf(rollConfig: unknown): ItemRef | undefined {
  const subject = (rollConfig as AmmoHolder & { subject?: { documentName?: string } }).subject;
  if (subject?.item) return itemRef(subject.item);
  if (subject?.documentName === "Item") {
    return itemRef(subject as { id?: string; name?: string; img?: string; type?: string });
  }
  return undefined;
}

export function ammunitionRef(rollConfig: unknown): ItemRef | undefined {
  return ammunitionOf(rollConfig as AmmoHolder);
}

// Dice an effect on the item adds (a Vicious Weapon's `2d6` through
// `system.damage.base.bonus`) are deliberately NOT reported. Reading the effect says
// what it COULD add, not what this roll did: dnd5e only applies an item's own effect
// when it is an active enchantment, and a weapon's extra dice are commonly crit-only,
// so an ordinary hit was credited with dice it never rolled. Attributing them
// honestly means proving the formula is in the built roll, not that an effect exists.

export function attributeItemParts(parts: AttributedPart[], rollConfig: unknown): AttributedPart[] {
  const holder = rollConfig as AmmoHolder;
  const own = itemRef(holder.subject?.item ?? {});
  const ammo = ammunitionOf(holder);
  return parts.map((part) => {
    if (part.from) return part;
    if (own && ITEM_SOURCES.has(part.source)) return { ...part, from: [own] };
    if (ammo && AMMO_SOURCES.has(part.source)) return { ...part, from: [ammo] };
    return part;
  });
}

/**
 * Name the items behind each modifier that came from an actor bonus field.
 *
 * Replaces the parts of one field with one part per contributor — the actor's own
 * base, then each item that adds to it — but only when the contributions match what
 * the roll used, in total AND in count. Equal totals alone are not enough: the app
 * pairs a source with a term by its value, so handing it three contributions for two
 * terms invites a bonus being paired with someone else's number. When they don't
 * match (a MULTIPLY change, a formula needing dice, an effect suppressed after the
 * roll was built) the original parts are kept — an unnamed bonus is better than a
 * wrongly named one.
 *
 * Parts are grouped by FIELD rather than by source name, because two of dnd5e's
 * rollData keys can read the same field (`@checkBonus` and `@abilityCheckBonus` both
 * come from `system.bonuses.abilities.check`); grouping by name would leave the
 * second one out of the payload entirely.
 */
export function attributeFieldParts(
  parts: AttributedPart[],
  subject: unknown,
  rollData: unknown,
  ctx: PathContext,
): AttributedPart[] {
  const holder = subject as { actor?: ActorLike } & ActorLike;
  const actor = holder?.actor ?? holder;
  if (!actor?.allApplicableEffects) return parts;

  // A literal-pushed bonus already records the field itself as its source.
  const fieldOf = (part: AttributedPart): string | undefined =>
    actorFieldForSource(part.source, ctx) ??
    (part.source.startsWith("system.") ? part.source : undefined);

  const out: AttributedPart[] = [];
  const claimed = new Set<string>();
  for (const part of parts) {
    const field = fieldOf(part);
    if (!field) {
      out.push(part);
      continue;
    }
    if (claimed.has(field)) continue;
    claimed.add(field);
    const fromField = parts.filter((p) => fieldOf(p) === field);
    const contributions = contributionsForField(actor, field, rollData);
    if (
      !contributions.length ||
      contributions.length !== fromField.length ||
      sum(contributions) !== sum(fromField)
    ) {
      out.push(...fromField);
      continue;
    }
    for (const c of contributions) {
      out.push({
        source: part.source,
        value: c.value,
        ...(c.item ? { from: [c.item] } : {}),
      });
    }
  }
  return out;
}
