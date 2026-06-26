import { RollType } from "../types";
import { type Enricher, type MessageConfig, mergeFlag } from "./shared";

function onPreRollRecharge(_config: unknown, _dialog: unknown, messageConfig: MessageConfig): void {
  // Recharge rolls carry no dnd5e roll flag at all; record the resolved rollType
  // so the collector classifies it instead of falling back to Manual.
  mergeFlag(messageConfig, { rollType: RollType.Recharge });
}

// Recharge rolls have no dnd5e roll flag; mark them at preroll so the collector
// promotes the otherwise-untagged message to RollType.Recharge.
export const dnd5ePreRollRechargeV2: Enricher = {
  hook: "dnd5e.preRollRechargeV2",
  handler: onPreRollRecharge as (...args: unknown[]) => void,
};
