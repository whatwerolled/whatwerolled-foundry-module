export enum MessageEventType {
  Created = "created",
  Updated = "updated",
  Deleted = "deleted",
}

export enum RollType {
  Ability = "ability",
  Save = "save",
  Skill = "skill",
  Tool = "tool",
  Death = "death",
  HitDie = "hitDie",
  Attack = "attack",
  Damage = "damage",
  /**
   * dnd5e tags concentration as a plain `"save"`; only the enricher knows the
   * truth (at roll time), so it writes this rollType into the cs flag directly.
   */
  Concentration = "concentration",
  /**
   * Recharge rolls carry no dnd5e roll flag at all; the enricher writes this
   * rollType into the cs flag so the collector classifies it (not Manual).
   */
  Recharge = "recharge",
  /**
   * Initiative messages are created by Foundry core, not dnd5e — no dnd5e roll
   * flag, but core stamps `flags.core.initiativeRoll`. The collector promotes
   * from that native flag.
   */
  Initiative = "initiative",
  /** Synthesized for rolls that aren't tagged by dnd5e (e.g. `/roll 1d20`). */
  Manual = "manual",
}

export enum UserRole {
  None = "NONE",
  Player = "PLAYER",
  Trusted = "TRUSTED",
  Assistant = "ASSISTANT",
  Gamemaster = "GAMEMASTER",
}

/**
 * Only the *terminal* death-save results. Plain success/failure isn't here —
 * that's just total vs DC, which the backend derives from the roll itself.
 * These depend on the running success/failure tally the roll message doesn't
 * carry, so the enricher stamps them; absent flag ⇒ an ongoing save.
 */
export enum DeathSaveOutcome {
  /** Third success — stabilized. */
  Stabilized = "stabilized",
  /** Third failure — dead. */
  Dead = "dead",
  /** Natural 20 — back to 1 HP. */
  Revived = "revived",
}
