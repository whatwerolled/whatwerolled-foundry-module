/**
 * Which actor field a roll's modifier was read from.
 *
 * dnd5e invents a rollData key per modifier and copies the value into it
 * (`constructParts({ mod, prof, saveBonus, … })`), discarding the origin: a finished
 * roll knows it added `@saveBonus`, not that the number came from
 * `system.bonuses.abilities.save`. That field is what lets a bonus be traced to the
 * effects, and so the items, granting it.
 *
 * Every entry is read off a dnd5e call site — `actor.mjs` (#rollD20Test, skill/tool
 * prep, getInitiativeRollConfig), `attack-data.mjs`, `base-activity.mjs`.
 */

export type PathContext = {
  ability?: string;
  /** Skill / tool id, which keys that statistic's own bonus (`ste`, `thief`). */
  skill?: string;
  tool?: string;
  /** mwak / rwak / msak / rsak — decides which action-type bonuses apply. */
  actionType?: string;
};

const ABILITY_SUFFIX = /^@([a-z]{3})(CheckBonus|SaveBonus|AbilityCheckBonus)$/;

/**
 * Undefined for references with nothing on the actor to trace: `@mod`, `@prof`,
 * `@situational` (typed into the dialog), the item-owned `@weaponMagic` /
 * `@ammoMagic`, and the ones whose field holds something other than what the roll
 * used — `@exhaustion` is stored positive and pushed negative, `@toolBonus` reads a
 * field the dnd5e schema doesn't define, and neither is an item's doing anyway.
 */
export function actorFieldForSource(source: string, ctx: PathContext): string | undefined {
  switch (source) {
    case "@saveBonus":
      return "system.bonuses.abilities.save";
    case "@checkBonus":
    case "@abilityCheckBonus":
      return "system.bonuses.abilities.check";
    case "@skillBonus":
      return "system.bonuses.abilities.skill";
    case "@actorBonus":
      return ctx.actionType ? `system.bonuses.${ctx.actionType}.attack` : undefined;
    case "@initiativeBonus":
      return "system.attributes.init.bonus";
  }
  // `@steBonus` / `@thiefBonus`: the skill's or tool's own bonus, keyed by its id.
  if (ctx.skill && source === `@${ctx.skill}Bonus`) {
    return `system.skills.${ctx.skill}.bonuses.check`;
  }
  if (ctx.tool && source === `@${ctx.tool}Bonus`) {
    return `system.tools.${ctx.tool}.bonuses.check`;
  }
  // `@dexSaveBonus` / `@dexCheckBonus` — that one ability's own bonus.
  const perAbility = ABILITY_SUFFIX.exec(source);
  if (perAbility) {
    const [, abbr, kind] = perAbility;
    return `system.abilities.${abbr}.bonuses.${kind === "SaveBonus" ? "save" : "check"}`;
  }
  return undefined;
}

/** Fields dnd5e pushes as a bare part (`parts.push(conc.bonuses.save)`). The part is
 *  the field's formula verbatim, so matching the string identifies it exactly. */
export function literalActorFields(rollType: string | undefined, ctx: PathContext): string[] {
  switch (rollType) {
    case "death":
      return ["system.attributes.death.bonuses.save"];
    case "concentration":
      return ["system.attributes.concentration.bonuses.save"];
    case "damage":
    case "healing":
      return ctx.actionType ? [`system.bonuses.${ctx.actionType}.damage`] : [];
    default:
      return [];
  }
}
