# What We Rolled

**Your table rolls a lot of dice. Now you can see all of them.**

What We Rolled collects every roll from your game, so you can look back on all of
them — the nat 20s, the clutch saves, the cursed luck. Your campaign, in numbers.

![Foundry v14](https://img.shields.io/badge/Foundry-v14-informational)
![dnd5e v5+](https://img.shields.io/badge/dnd5e-v5%2B-informational)

**🌐 [whatwerolled.com](https://whatwerolled.com) · 🎲 [Open the app](https://app.whatwerolled.com)**

> This module is the **Foundry VTT collector** for [What We Rolled](https://whatwerolled.com) — a
> platform for capturing and visualizing what your table actually rolls. Foundry + D&D 5e is the
> first surface; the [website](https://whatwerolled.com) is where those rolls become your
> campaign's history, charts, and numbers to look back on. More systems on the way.

---

## Disclaimer

What We Rolled is in **early, active development**. Where it's headed: every game
system and every roll-modifying module supported, with each roll captured
faithfully. Where it is today: built for dnd5e, with coverage of the wider ecosystem
of roll-altering modules and homebrew growing release by release. Most common setups
already work — and anything that doesn't yet is on the roadmap, not overlooked.

## Features

- 🎲 **Captures every roll** — attacks, damage, saves, skill checks, ability
  checks, custom rolls. If it lands in chat, it's tracked.
- 👥 **Works for the whole table** — every player's rolls are collected
  automatically, no per-player setup.
- 🧹 **Delete a roll anytime** — remove its message in chat and it drops out of
  your stats.
- 🧩 **Built for dnd5e** — fully supported today, with more systems on the way.

## Installation

In Foundry's **Add-on Modules** tab, click **Install Module** and paste this
manifest URL:

```
https://github.com/whatwerolled/whatwerolled-foundry-module/releases/latest/download/module.json
```

Then enable **What We Rolled** in your world's module list.

## Setup

1. Sign in at [your What We Rolled dashboard](https://app.whatwerolled.com) and create (or open) a campaign.
2. Copy the campaign's **Campaign ID**.
3. In Foundry, go to **Game Settings → Configure Settings → What We Rolled**:

   | Setting         | What to paste                                       |
   | --------------- | --------------------------------------------------- |
   | **Campaign ID** | The campaign id from your What We Rolled dashboard. |

4. Save. That's it — your next roll will show up on the dashboard.

## Compatibility

|                  | Minimum | Verified |
| ---------------- | ------- | -------- |
| **Foundry VTT**  | 14      | 14.364   |
| **dnd5e system** | 5       | 5.3.3    |

dnd5e only for now — more systems are on the way.

## Privacy

What We Rolled only sends roll data — never your chat, notes, or personal info.
See **[Privacy & Data](./PRIVACY.md)** for the full list of what's sent and what
isn't, and how to stop sending at any time.

## Support & Feedback

Found a bug, have a question, or want to request a feature? Open an issue at
[github.com/whatwerolled/whatwerolled-foundry-module/issues](https://github.com/whatwerolled/whatwerolled-foundry-module/issues).

## License

Released under the [MIT License](./LICENSE).
