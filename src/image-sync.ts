import { CAMPAIGN_ID_SETTINGS_KEY, MODULE_ID } from "./constants";
import type { MessageEvent } from "./payload-types";

const cache = new Map<string, string | null>();
const CORE_DEFAULT = "icons/svg/mystery-man.svg";
const MAX_DIM = 256;
const TIMEOUT_MS = 4000;
const VIDEO_EXT = /\.(webm|mp4|m4v|ogv)$/i;

type Loose = Record<string, unknown> & { texture?: { src?: string }; img?: string };

// Unlinked token (NPC): its own art. Linked / PC / no token: the actor portrait.
function resolveAvatarSource(message: ChatMessage): string | null {
  const speaker = message.speaker as { scene?: string; actor?: string; token?: string };
  const actor = speaker?.actor
    ? (game.actors?.get(speaker.actor) as unknown as Loose | undefined)
    : undefined;
  const tokenDoc =
    speaker?.scene && speaker?.token
      ? (game.scenes?.get(speaker.scene)?.tokens?.get(speaker.token) as unknown as
          | (Loose & { actorLink?: boolean })
          | undefined)
      : undefined;
  const proto = (actor?.prototypeToken as { texture?: { src?: string } } | undefined)?.texture?.src;
  const candidates =
    tokenDoc && !tokenDoc.actorLink
      ? [tokenDoc.texture?.src, proto, actor?.img]
      : [actor?.img, proto];
  return candidates.find((s): s is string => !!s && !s.includes("*") && s !== CORE_DEFAULT) ?? null;
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

// Best-effort: attaching an avatar must never throw or hang, so it can't block the roll POST.
export async function attachActorImage(event: MessageEvent, message: ChatMessage): Promise<void> {
  try {
    if (!event.collectedData?.actor) return;
    const campaignId = game.settings!.get(MODULE_ID, CAMPAIGN_ID_SETTINGS_KEY).trim();
    if (!campaignId) return;

    const src = resolveAvatarSource(message);
    if (!src) return;

    let encoded = cache.get(src);
    if (encoded === undefined) {
      const buf = await compress(src);
      encoded = buf ? toBase64(buf) : null;
      cache.set(src, encoded);
    }
    if (encoded) {
      event.images = { actor: { dataBase64: encoded } };
      return;
    }
    const abs = new URL(src, window.location.origin).href;
    if (/^https?:/i.test(abs)) event.images = { actor: { sourceUrl: abs } };
  } catch {
    // avatar is optional — swallow so the roll still POSTs
  }
}
