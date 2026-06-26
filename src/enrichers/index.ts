import { type Enricher } from "./shared";
import { dnd5ePreRollV2 } from "./dnd5e.preRollV2";
import { dnd5ePostBuildRollConfig } from "./dnd5e.postBuildRollConfig";
import { dnd5eRollDeathSaveV2 } from "./dnd5e.rollDeathSaveV2";
import { dnd5ePreRollRechargeV2 } from "./dnd5e.preRollRechargeV2";

// Add a new enricher by creating its file (one `{ hook, handler }` export) and
// listing it here.
const ENRICHERS: readonly Enricher[] = [
  dnd5ePreRollV2,
  dnd5ePostBuildRollConfig,
  dnd5eRollDeathSaveV2,
  dnd5ePreRollRechargeV2,
];

export function registerEnrichers(): void {
  // dnd5e hooks aren't in fvtt-types; bind keeps `Hooks` as `this`.
  const on = Hooks.on.bind(Hooks) as (hook: string, fn: (...args: unknown[]) => void) => number;
  for (const { hook, handler } of ENRICHERS) on(hook, handler);
}
