/** Session-scoped store for pre-filter shell output, recoverable by ID. */

export interface RawOutputEntry {
  /** Numeric ID (auto-incrementing per session). */
  id: number;
  /** The original formatted string before filtering. */
  raw: string;
  /** The command that produced this output. */
  command: string;
  /** Which shell tool produced this output. */
  tool: string;
  /** Character count of the filtered output. */
  filteredChars: number;
  /** Timestamp when stored. */
  storedAt: number;
}

/** Max entries kept in memory. Oldest evicted first. */
const DEFAULT_MAX_ENTRIES = 200;

/** Max characters per raw entry. Extremely large outputs are capped. */
const DEFAULT_MAX_RAW_CHARS = 256_000;

export class RawOutputStore {
  private nextId = 1;
  private readonly entries = new Map<number, RawOutputEntry>();
  private readonly maxEntries: number;
  private readonly maxRawChars: number;

  constructor(opts?: { maxEntries?: number; maxRawChars?: number }) {
    this.maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxRawChars = opts?.maxRawChars ?? DEFAULT_MAX_RAW_CHARS;
  }

  /** Store a raw output and return its ID. Evicts oldest if at capacity. */
  store(raw: string, meta: { command: string; tool: string; filteredChars: number }): number {
    const id = this.nextId++;
    const capped = raw.length > this.maxRawChars ? raw.slice(0, this.maxRawChars) : raw;

    this.entries.set(id, {
      id,
      raw: capped,
      command: meta.command,
      tool: meta.tool,
      filteredChars: meta.filteredChars,
      storedAt: Date.now(),
    });

    // Evict oldest entries over capacity.
    if (this.entries.size > this.maxEntries) {
      const keys = [...this.entries.keys()];
      const excess = this.entries.size - this.maxEntries;
      for (let i = 0; i < excess; i++) {
        const key = keys[i];
        if (key !== undefined) this.entries.delete(key);
      }
    }

    return id;
  }

  /** Retrieve a stored raw output by ID. Returns undefined if not found. */
  get(id: number): RawOutputEntry | undefined {
    return this.entries.get(id);
  }

  /** Retrieve with optional tail/cap. Returns undefined if not found. */
  getFiltered(
    id: number,
    opts?: { tailLines?: number; maxChars?: number },
  ): RawOutputEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (!opts) return entry;

    let raw = entry.raw;
    if (opts.tailLines && opts.tailLines > 0) {
      const lines = raw.split("\n");
      if (lines.length > opts.tailLines) {
        const dropped = lines.length - opts.tailLines;
        raw = `[ΓÇª ${dropped} earlier lines ΓÇª]\n${lines.slice(-opts.tailLines).join("\n")}`;
      }
    }
    if (opts.maxChars && opts.maxChars > 0 && raw.length > opts.maxChars) {
      raw = raw.slice(0, opts.maxChars);
    }
    return { ...entry, raw };
  }

  /** Current number of stored entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Clear all stored entries. Called at session end. */
  clear(): void {
    this.entries.clear();
    this.nextId = 1;
  }
}

/** Singleton store for the current session. */
let _instance: RawOutputStore | undefined;

/** Get or create the session-scoped raw output store. */
export function getRawOutputStore(): RawOutputStore {
  if (!_instance) {
    _instance = new RawOutputStore();
  }
  return _instance;
}

/** Reset the store (for tests or session restart). */
export function resetRawOutputStore(): void {
  _instance = undefined;
}
