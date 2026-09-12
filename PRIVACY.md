# What We Rolled — Privacy & Data

What We Rolled only ever looks at chat messages that contain a **roll**.
Everything else — in-character banter, GM notes, chat without a roll — is ignored.

## What gets sent

For each roll, the module sends to the What We Rolled service:

- the roll formula, dice, and result;
- the name and avatar of the player who rolled, and which character or token made
  the roll;
- your world name and game system, and their versions;
- whether the roll was a whisper or blind roll, and when it happened.

And for the things the roll used, so the app can show them instead of an id:

- each item, spell or feature involved — its name, its icon, and its description
  as plain text (long ones are cut short);
- the game's own rule text behind a weapon mastery the attack used;
- the token's picture as well as the character's portrait, so a card can show
  whichever stood in for them.

## What is never sent

- No passwords or account credentials.
- No chat text that isn't a roll.
- No personal information beyond the player and character names listed above.
- Nothing from an item a roll didn't use, and no GM-only item text.

## Staying in control

- Nothing is sent until a Campaign ID is set.
- Clear the Campaign ID and all sending stops.
- **Collect rolls**, in **Game Settings → Configure Settings → What We Rolled**,
  stops it at the source.
- Delete a roll's message in Foundry and it drops out of your stats.
