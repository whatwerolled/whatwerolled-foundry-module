# Changelog

Written for GMs — what changed at your table, not commit logs. Each version's
section here becomes that release's notes on GitHub and Foundry.

## 0.7.0

**Every roll now says what it was made with** — the weapon swung, the ammunition spent,
the wand or scroll a spell was cast from, and the item behind each bonus. A `+1` used to
be a `+1`; now it names the ring, the arrows or the feature that granted it.

**The items themselves travel with the roll** — name, picture and description — so each
one is readable on the card rather than a name your table has to recognise.

**An attack names the weapon mastery it used**, with the rule that mastery applies.

**Token art appears alongside the character's portrait.** Six goblins from one template
each look like themselves, and a druid in wild shape rolls as the bear.

**A player character stays one character** however often its token is placed on the map,
while copies of a shared creature stay told apart.

**Initiative is recorded like any other roll**, with the ability behind its modifier named.

**GM-only text stays at the table.** Text marked GM-only in an item's description is
removed before anything is sent.

**A new setting: Collect rolls**, on by default. Turn it off and no roll leaves your
table, without uninstalling.

Fixed:

- Saving throws — death saves and concentration included — recorded no bonuses at all
  when two items each granted one.
- A flat damage bonus from an item was invisible.
- A spell with no flat modifier, like Fireball, lost the spell and the item it was cast
  from.
- A recharge never named the ability recharging.
- Ammunition set to replace a weapon's damage credited the weapon with it.
- One unreadable reference in an item's description could discard the whole roll, and a
  world whose item text wouldn't render sent every roll with no pictures.

## 0.6.0

**Roll table draws now show what came up** — the entry and the table it came from.

**Healing rolls now explain their bonus**, the way attacks and checks already do.

**Bonuses that scale with a class feature or your level are now labelled**, not left as a bare number.

**Sharper character portraits.**

## 0.5.0

**What We Rolled now works with Pathfinder 2e and Starfinder 2e.**

## 0.4.0

**Now works on Foundry VTT v13** (previously v14 only).

## 0.3.0

**Character portraits now appear on your roll cards.** Foundry stores each portrait as a
path on your own computer or network, which whatwerolled.com couldn't reach — so cards fell
back to a plain initial, especially for self-hosted games. Each roll now sends a small copy
of the roller's portrait (or an NPC token's own art) to your campaign so it shows on the card.

## 0.2.0

**Now fully supports [Ready Set Roll (Reforged)](https://foundryvtt.com/packages/rsreforged).**
Attack and damage rolls made through RSReforged now show their full breakdown — where each
bonus comes from (ability, proficiency, and so on), not just the total — the same as your
normal rolls.

## 0.1.1

**What We Rolled collects every roll from your Foundry game** — attacks, damage, saves, skill and ability checks, and more — into your campaign at [whatwerolled.com](https://whatwerolled.com), where they become your history and stats over time.

**Getting started**

1. Sign in at [app.whatwerolled.com](https://app.whatwerolled.com) and open (or create) a campaign.
2. Copy the **Campaign ID** into **Game Settings → Configure Settings → What We Rolled**.
3. Roll like normal — your rolls show up on the dashboard.

Built for D&D 5e today, with more systems on the way.

## 0.1.0

Initial release.
