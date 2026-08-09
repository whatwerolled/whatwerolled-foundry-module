import { MODULE_ID } from "./constants";

// A draw normally produces one entry; only `drawMany` or overlapping ranges give
// more. Cap it so a pathological table can't bloat the roll payload, and cap the
// entry text — `description` is an HTML field with no length limit.
const MAX_DRAWS = 20;
const MAX_TEXT = 400;

type TableLike = { uuid?: string; name?: string; formula?: string };

type DrawnResult = {
  id?: string;
  type?: string;
  name?: string;
  description?: string;
  img?: string;
  documentUuid?: string;
  weight?: number;
  range?: number[];
  parent?: TableLike;
};

type ToMessage = (results: DrawnResult[], options?: Record<string, unknown>) => unknown;

function plainText(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = new DOMParser().parseFromString(html, "text/html").body.textContent?.trim();
  if (!text) return undefined;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

// What the draw produced — never the table's other rows, so a 300-row loot table
// still sends one entry. The `table` reference is attribution only; each draw
// carries its own data because the frontend can't reach Foundry to resolve it.
function describeDraw(table: TableLike, results: DrawnResult[]): Record<string, unknown> {
  // A list rather than a map keyed by uuid: Foundry expands dotted keys when it
  // persists the message, so a `RollTable.abc` key would arrive nested — and a
  // compendium uuid would nest several levels deep. Values are left alone.
  const tables = new Map<string, Record<string, unknown>>();
  const addTable = (source: TableLike | undefined, rolled: boolean): void => {
    if (!source?.uuid || tables.has(source.uuid)) return;
    tables.set(source.uuid, {
      uuid: source.uuid,
      name: source.name,
      formula: source.formula,
      ...(rolled ? { rolled: true } : {}),
    });
  };
  // Recursion draws from an inner table and merges those entries in, so the map
  // can hold several — only this one was actually rolled.
  addTable(table, true);

  const drawnEntries = results.slice(0, MAX_DRAWS).map((result) => {
    const source = result.parent ?? table;
    addTable(result.parent, false);
    const text = plainText(result.description);
    return {
      table: source?.uuid,
      resultId: result.id,
      type: result.type,
      ...(result.name ? { name: result.name } : {}),
      ...(text ? { text } : {}),
      ...(result.img ? { img: result.img } : {}),
      // May point at a compendium or a since-deleted document; the frontend
      // resolves it leniently.
      ...(result.documentUuid ? { documentUuid: result.documentUuid } : {}),
      ...(Array.isArray(result.range) ? { range: result.range } : {}),
      ...(typeof result.weight === "number" ? { weight: result.weight } : {}),
    };
  });

  return { rollTables: [...tables.values()], drawnEntries };
}

/**
 * Record what a RollTable draw actually produced.
 *
 * Foundry fires no hook for a draw, and the drawn entries only ever appear in the
 * message's rendered HTML — the roll itself carries a number, not an outcome. So we
 * wrap `toMessage`, the documented method that receives the drawn TableResult
 * documents, and stamp them into the message data BEFORE it is created: the flag is
 * then part of the created document, every client mirrors identical data, and the
 * collector's `createChatMessage` already sees it. Deriving the entry from the roll
 * total instead would be wrong for recursive draws, tables without replacement,
 * `drawMany`, and compendium tables.
 *
 * This is core Foundry rather than a game system, so it lives outside `enrichers/`.
 */
export function captureRollTableDraws(): void {
  const documentClass = CONFIG.RollTable?.documentClass as unknown as
    | { prototype: { toMessage: ToMessage } }
    | undefined;
  const original = documentClass?.prototype?.toMessage;
  if (!original) return;

  documentClass.prototype.toMessage = function (
    this: TableLike,
    results: DrawnResult[],
    options: Record<string, unknown> = {},
  ) {
    let patched = options;
    try {
      const messageData = (options.messageData ?? {}) as Record<string, unknown>;
      const flags = (messageData.flags ?? {}) as Record<string, unknown>;
      patched = {
        ...options,
        messageData: {
          ...messageData,
          flags: { ...flags, [MODULE_ID]: describeDraw(this, results ?? []) },
        },
      };
    } catch {
      // Recording the outcome is optional — a draw must still post its message.
    }
    return original.call(this, results, patched);
  };
}
