import { MODULE_ID } from "../constants";
import { capturePartValues } from "./parts";
import { attributeFieldParts, initiativeAbility } from "./dnd5e.attribution";
import { itemEntries } from "./shared";

type InitiativeConfig = { parts?: unknown; data?: unknown; options?: { fixed?: unknown } } | null;
type InitiativeActor = {
  getInitiativeRollConfig(options?: object): InitiativeConfig;
  system?: { attributes?: { init?: { ability?: string } } };
};
type StampableRoll = { options?: Record<string, unknown> } | null;

/** The config each actor's last `getInitiativeRollConfig` produced, so the roll can be
 *  described without asking for it again — asking re-fires dnd5e's
 *  `preConfigureInitiative` hook, which other modules listen to. */
const lastConfig = new WeakMap<object, InitiativeConfig>();

/**
 * Initiative can reach no dnd5e roll hook: `getInitiativeRoll` builds the D20Roll
 * itself, so `postBuildRollConfig` never sees it and the message Foundry creates for
 * the combatant carries bare numbers.
 *
 * So wrap the documented methods, the same approach `roll-table.ts` takes for core
 * RollTable draws, and stamp the sources onto the roll. A Roll serialises its options,
 * so they reach the message without a second write.
 */
export function patchInitiativeRoll(): void {
  // At `init` the system may not have installed its Actor class yet; `setup` runs
  // after every package's init, and nothing rolls initiative before then.
  Hooks.once("setup", applyInitiativePatch);
}

function applyInitiativePatch(): void {
  const proto = CONFIG.Actor?.documentClass?.prototype as unknown as
    | (InitiativeActor & { getInitiativeRoll?: (options?: object) => StampableRoll })
    | undefined;
  const original = proto?.getInitiativeRoll;
  const originalConfig = proto?.getInitiativeRollConfig;
  if (!proto || typeof original !== "function" || typeof originalConfig !== "function") return;

  proto.getInitiativeRollConfig = function (this: InitiativeActor, options?: object) {
    const config = originalConfig.call(this, options);
    lastConfig.set(this, config);
    return config;
  };

  proto.getInitiativeRoll = function (this: InitiativeActor, options?: object) {
    const roll = original.call(this, options);
    try {
      // The dialog path builds its roll through `BasicRoll.build`, so that roll is
      // already described — including anything typed into the dialog, which a config
      // rebuilt here would not have. Never overwrite it.
      if (!roll || roll.options?.[MODULE_ID]) return roll;
      const config = lastConfig.get(this);
      // With the `initiativeScore` setting on, the roll is a flat score and contains
      // none of the config's parts; describing it would name modifiers it never had.
      if (!config || config.options?.fixed !== undefined) return roll;
      // `@mod` here is the initiative ability's modifier; naming it is what turns a
      // bare number on the card into "Dexterity modifier".
      const captured = capturePartValues(config.parts, config.data, initiativeAbility(this));
      // Attribute the same two ways `postBuildRollConfig` does — an initiative bonus
      // comes from an item as often as any other check does (a Stone of Good Luck
      // adds to every one), and without this it reads as a bare "check bonus".
      const parts = attributeFieldParts(captured, this, config.data, {});
      if (parts.length) {
        const items = itemEntries(parts.flatMap((p) => p.from ?? []));
        roll.options ??= {};
        roll.options[MODULE_ID] = {
          parts: parts.map(({ from, ...rest }) =>
            from ? { ...rest, from: from.map((r) => r.id) } : rest,
          ),
          ...(Object.keys(items).length ? { items } : {}),
        };
      }
    } catch {
      // Enrichment is best-effort; never break the roll itself.
    }
    return roll;
  };
}
