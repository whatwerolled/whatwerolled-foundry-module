/**
 * A system's stored HTML as plain text a card can show.
 *
 * Stored text is laced with Foundry's own syntax — `@UUID[…]{Fireball}`,
 * `[[/damage 2d6]]`, `&Reference[…]` — which means nothing outside the world it came
 * from, so it goes through the game's own enricher here, where the compendia exist,
 * and the markup then comes off: the app lays the card out itself.
 *
 * GM-only prose is the reason this is one function rather than two lines at each
 * caller. A system marks it rather than removing it, and the removal happens per
 * VIEWER: pf2e strips `data-visibility="gm"` only on a client that isn't the GM's
 * (`user-visibility.ts`), while `secrets: false` covers only core's own secret
 * blocks. Every client posts the same payload, so without this the GM's copy of a
 * roll would carry text the table was never meant to read — and whichever client
 * posted last would decide.
 */
export async function proseFrom(raw: string, max: number): Promise<string> {
  const enricher = foundry.applications.ux.TextEditor.implementation;
  const el = document.createElement("div");
  el.innerHTML = await enricher.enrichHTML(raw, { secrets: false });
  el.querySelectorAll(
    '[data-visibility="gm"],[data-visibility="owner"],[data-visibility="none"]',
  ).forEach((hidden) => hidden.remove());
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
