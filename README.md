# What We Rolled

**Your table rolls a lot of dice. Now you can see all of them.**

What We Rolled captures every roll from your game and turns it into your campaign's
history — the nat 20s, the clutch saves, the cursed luck — with charts, per-session
stats, and even your rolls played back alongside the recording. Your campaign, in
numbers.

![Foundry v13+](https://img.shields.io/badge/Foundry-v13%2B-informational)
![dnd5e v5+](https://img.shields.io/badge/dnd5e-v5%2B-informational)

<!-- HERO GIF: a roll happens in Foundry → the card appears in the What We Rolled web app. This is the whole pitch in 2 seconds. -->

![What We Rolled in action](docs/media/hero.gif)

**🌐 [whatwerolled.com](https://whatwerolled.com) · 🎲 [Open the app](https://app.whatwerolled.com)**

---

## How it works

1. **Install the module** — in Foundry's **Add-on Modules** tab, click **Install
   Module** and search **What We Rolled**. Or paste the manifest URL into the field
   at the bottom of that dialog:
   ```
   https://github.com/whatwerolled/whatwerolled-foundry-module/releases/latest/download/module.json
   ```
   Then enable it in your world. ([Package page](https://foundryvtt.com/packages/whatwerolled))
2. **Link your campaign** — copy your Campaign ID from your
   [What We Rolled dashboard](https://app.whatwerolled.com) and paste it into
   **Game Settings → Configure Settings → What We Rolled** in Foundry.
3. **Roll.** Every roll at the table shows up in the app — history, charts, and
   per-session stats.

---

## What you get

### 📜 Every roll, kept

Every roll at your table lands in one place, automatically — no per-player setup.
Each keeps its full detail — the dice, every bonus in the breakdown, targets, crits,
healing, death saves — shown just as it happened. Delete a roll's message in Foundry
and it drops out of your history too.

<!-- SCREENSHOT: the roll history feed with a few rich cards + a breakdown popover open -->

![Roll history](docs/media/history.png)

### 📊 Campaign analytics

Here's where it gets interesting. See who runs hot and who's cursed: **nat 20 and
nat 1 rates** per character, your party's **d20 spread**, and average rolls against
the expected 10.5. All of it updates as your campaign grows.

<!-- SCREENSHOT: the analytics page — hero stat tiles + a couple of the signature charts -->

![Campaign analytics](docs/media/analytics.png)

### ▶️ Sessions, synced to your recording

Your campaign is made of game nights. Mark one as a **session** to see just that
evening — its rolls and **stats scoped to that night**, not the whole campaign at
once.

Attach the game's **YouTube recording** and the session comes alive: rolls sit beside
the video like a live chat, **click a roll to jump the video to that moment**, and as
it plays the rolls scroll to keep up. Relive the crit that ended the boss — and see it
land.

<!-- GIF: session list → open a session → rolls beside the video → click a roll → video seeks. See docs/module-page-media.md -->

![Sessions with synced playback](docs/media/sessions-video.gif)

---

## Works with your rolling modules

What We Rolled captures ordinary rolls and rolls made through popular roll helpers:

- **[Ready Set Roll (Reforged)](https://foundryvtt.com/packages/rsreforged)** — fully supported, with each roll's full breakdown.
- **[Ready Set Roll (D&D 5e)](https://foundryvtt.com/packages/ready-set-roll-5e)** on Foundry v13 — captured.
- **[Midi-QOL](https://foundryvtt.com/packages/midi-qol)** — in progress.

**Using a roll module we don't list yet?** Tell us and we'll add it — see
[Support & feedback](#support--feedback) below.

---

## Your data

What We Rolled only sends **roll data** — the roll itself (formula, dice, result),
who rolled it (player name and avatar) and which character, your world and game
system (and their versions), whether the roll was whispered or blind, and when it
happened. It **never** sends your chat, notes, or anything that isn't a roll. Nothing
is sent until you set a Campaign ID, and clearing it stops sending at any time. See
**[Privacy & Data](./PRIVACY.md)** for the full list.

---

## Compatibility

|                 | Minimum | Verified |
| --------------- | ------- | -------- |
| **Foundry VTT** | 13      | 14.364   |
| **D&D 5e**      | 5       | 5.3.3    |

D&D 5e for now.

## Early access

What We Rolled is in early, active development. It's built for D&D 5e today, with
more systems and roll-module support landing every release.

## Support & feedback

The quickest way to reach us is **Discord**. We're active in the community
[Foundry VTT server](https://discord.gg/foundryvtt) — ask about the module in the
**#modules** channel and tag **@axelgreenkp**, and we'll pick it up.

Already signed in to the app? There's a **support chat** built into What We Rolled.

Prefer somewhere else? Open a
[GitHub issue](https://github.com/whatwerolled/whatwerolled-foundry-module/issues) or
email [contact@whatwerolled.com](mailto:contact@whatwerolled.com).

## License

Released under the [MIT License](./LICENSE).
