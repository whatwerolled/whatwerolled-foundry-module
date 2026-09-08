import { RollType } from "../types";
import {
  type Enricher,
  type MessageConfig,
  type RollConfig,
  mergeFlag,
  messageConfigByProcess,
} from "./shared";

function onPreRollRecharge(
  rollConfig: RollConfig,
  _dialog: unknown,
  messageConfig: MessageConfig,
): void {
  // Recharge rolls carry no dnd5e roll flag at all; record the resolved rollType
  // so the collector classifies it instead of falling back to Manual.
  mergeFlag(messageConfig, { rollType: RollType.Recharge });
  // Link the config so postBuild can enrich this roll: `preRollV2` only links the
  // types it recognises, and a recharge is not one of them — but it is a roll made BY
  // an item, so the item still needs naming, and postBuild is what does that.
  messageConfigByProcess.set(rollConfig, messageConfig);
}

export const dnd5ePreRollRechargeV2: Enricher = {
  hook: "dnd5e.preRollRechargeV2",
  handler: onPreRollRecharge as (...args: unknown[]) => void,
};
