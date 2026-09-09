import { MODULE_ID, Setting } from "./constants";
import { itemEntriesById } from "./registry";
import type { ImageEntry, Images, MessageEvent } from "./payload-types";

const cache = new Map<string, string | null>();
const CORE_DEFAULT = "icons/svg/mystery-man.svg";
const MAX_DIM = 512;
const TIMEOUT_MS = 4000;
const VIDEO_EXT = /\.(webm|mp4|m4v|ogv)$/i;

type Loose = Record<string, unknown> & { texture?: { src?: string }; img?: string };

const usable = (src: string | undefined): src is string =>
  !!src && !src.includes("*") && src !== CORE_DEFAULT;

function actorImageSource(message: ChatMessage): string | null {
  const speaker = message.speaker as { actor?: string };
  const actor = speaker?.actor
    ? (game.actors?.get(speaker.actor) as unknown as Loose | undefined)
    : undefined;
  const proto = (actor?.prototypeToken as { texture?: { src?: string } } | undefined)?.texture?.src;
  return [actor?.img, proto].find(usable) ?? null;
}

/**
 * What stood on the table for this roll — the token's own art.
 *
 * Not the same question as the portrait: an unlinked token carries its own image, so
 * six goblins off one template can each look different. Null when no token spoke, or
 * when it has since been removed and its art is no longer knowable.
 */
function tokenImageSource(message: ChatMessage): string | null {
  const speaker = message.speaker as { scene?: string; token?: string };
  if (!speaker?.scene || !speaker?.token) return null;
  const token = game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token) as unknown as
    | Loose
    | undefined;
  return usable(token?.texture?.src) ? token!.texture!.src! : null;
}

async function bitmapFromVideo(src: string): Promise<ImageBitmap> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.preload = "auto";
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("video timeout")), TIMEOUT_MS);
      video.onloadeddata = () => (clearTimeout(timer), resolve());
      video.onerror = () => (clearTimeout(timer), reject(new Error("video failed")));
    });
    return await createImageBitmap(video);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

async function compress(src: string): Promise<ArrayBuffer | null> {
  try {
    let bitmap: ImageBitmap;
    if (VIDEO_EXT.test(src)) {
      bitmap = await bitmapFromVideo(src);
    } else {
      const res = await fetch(src, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      bitmap = await createImageBitmap(await res.blob());
    }
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
    return await blob.arrayBuffer();
  } catch {
    return null;
  }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * A Foundry served from a laptop or a LAN: an address only this table can reach.
 *
 * Includes the name forms, not just the numeric ranges — a GM serving on
 * `foundry.local` or a bare `gm-pc` is the same unreachable machine, and handing that
 * address to the backend only produces a fetch nobody can satisfy.
 */
const PRIVATE_HOST =
  /^(localhost|[^.]+$|.+\.(local|localdomain|internal|lan|home|home\.arpa)$|127\.|0\.0\.0\.0|169\.254\.|\[::1\]|\[f[cd][0-9a-f]{2}:|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

/** Only successes are remembered: a miss is usually a timeout under load, and caching
 *  it would degrade every later roll for good. */
async function entryFor(src: string): Promise<ImageEntry | undefined> {
  const cached = cache.get(src);
  if (cached) return { dataBase64: cached };
  const buf = await compress(src);
  if (buf) {
    const encoded = toBase64(buf);
    cache.set(src, encoded);
    return { dataBase64: encoded };
  }
  // Unreadable here (a video frame that wouldn't decode, a missing file). Pass the
  // address on only if the backend could actually fetch it — most Foundry worlds are
  // served from the GM's own machine, where the URL resolves for nobody else.
  const abs = new URL(src, window.location.origin);
  return /^https?:$/i.test(abs.protocol) && !PRIVATE_HOST.test(abs.hostname)
    ? { sourceUrl: abs.href }
    : undefined;
}

/** Read off the payload rather than the message: that is where pf2e's own modifier
 *  sources have been resolved, and each entry already carries the picture's path. */
async function itemEntries(event: MessageEvent): Promise<Record<string, ImageEntry>> {
  const out: Record<string, ImageEntry> = {};
  // Every scope, not only the message's: a re-homed roll (RSReforged, MIDI) has no
  // message flag, and reading that alone sent those tables' rolls without any icons.
  for (const [id, entries] of itemEntriesById(event)) {
    const img = entries.find((e) => usable(e.img))?.img;
    if (!img) continue;
    const entry = await entryFor(img);
    if (entry) out[id] = entry;
  }
  return out;
}

/**
 * Attach the pictures a roll needs: the character's portrait, the token that rolled,
 * and every involved item's icon.
 *
 * Portrait and token art are both sent even when they are the same file — which is
 * which is what the backend can't work out afterwards, and that matters more than the
 * duplicate bytes. Each is attached as it succeeds, so one unreadable picture doesn't
 * take the others with it.
 */
export async function attachActorImage(event: MessageEvent, message: ChatMessage): Promise<void> {
  try {
    if (!event.collectedData?.actor) return;
    const campaignId = game.settings!.get(MODULE_ID, Setting.CampaignId).trim();
    if (!campaignId) return;

    const images: Images = {};
    event.images = images;
    const actorSrc = actorImageSource(message);
    if (actorSrc) {
      const entry = await entryFor(actorSrc);
      if (entry) images.actor = entry;
    }
    const tokenSrc = tokenImageSource(message);
    if (tokenSrc) {
      const entry = await entryFor(tokenSrc);
      if (entry) images.token = entry;
    }
    const items = await itemEntries(event);
    if (Object.keys(items).length) images.items = items;

    if (!Object.keys(images).length) delete event.images;
  } catch {
    // pictures are optional — swallow so the roll still POSTs
  }
}
