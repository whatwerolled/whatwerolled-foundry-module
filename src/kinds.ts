/**
 * Our own bucket for an item, across systems.
 *
 * Item types don't generalise — dnd5e has `feat` and `equipment`, pf2e has `action`,
 * `armor`, `shield` and no `tool` at all — so comparing "cast a spell" between tables
 * needs a vocabulary of ours. The system's own type travels alongside it.
 *
 * Anything unlisted gets no kind rather than a wrong one: `class`, `background` and
 * `ancestry` are character build-up, never behind a roll.
 */

export enum ItemKind {
  Weapon = "weapon",
  Spell = "spell",
  Feature = "feature",
  Consumable = "consumable",
  Gear = "gear",
  Tool = "tool",
  Facility = "facility",
  Condition = "condition",
  Effect = "effect",
}

const DND5E: Record<string, ItemKind> = {
  weapon: ItemKind.Weapon,
  spell: ItemKind.Spell,
  feat: ItemKind.Feature,
  consumable: ItemKind.Consumable,
  equipment: ItemKind.Gear,
  container: ItemKind.Gear,
  tool: ItemKind.Tool,
  facility: ItemKind.Facility,
};

// pf2e splits armour and shields out of equipment, treats abilities and feats as near
// the same thing, and models conditions and spell effects as items — which is why a
// modifier there can point at a `condition`. `melee` is an NPC's attack.
const PF2E: Record<string, ItemKind> = {
  weapon: ItemKind.Weapon,
  melee: ItemKind.Weapon,
  shield: ItemKind.Gear,
  armor: ItemKind.Gear,
  equipment: ItemKind.Gear,
  backpack: ItemKind.Gear,
  spell: ItemKind.Spell,
  spellcastingEntry: ItemKind.Spell,
  feat: ItemKind.Feature,
  action: ItemKind.Feature,
  consumable: ItemKind.Consumable,
  ammo: ItemKind.Consumable,
  lore: ItemKind.Tool,
  condition: ItemKind.Condition,
  affliction: ItemKind.Condition,
  effect: ItemKind.Effect,
};

export function kindOf(type: string | undefined): ItemKind | undefined {
  if (!type) return undefined;
  const systemId = game?.system?.id;
  if (systemId === "dnd5e") return DND5E[type];
  if (systemId === "pf2e" || systemId === "sf2e") return PF2E[type];
  return undefined;
}
