import defaults from "./cms-defaults.json";
import type { CollectionName } from "./cms-schema";

/** A page section's content (the `data` JSON of a page_blocks row). `enabled: false` hides it from visitors. */
export type BlockData = Record<string, unknown>;

/* ───────────── path helpers (paths look like "title" or "items.2.description") ───────────── */

export function getPath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function setPath(data: BlockData, path: string, value: unknown): BlockData {
  const root = structuredClone(data);
  const keys = path.split(".");
  let cur = root as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i] as string;
    const next = cur[key];
    if (next === null || typeof next !== "object") {
      cur[key] = /^\d+$/.test(keys[i + 1] as string) ? [] : {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1] as string] = value;
  return root;
}

export function str(data: unknown, path: string, fallback = ""): string {
  const v = getPath(data, path);
  return typeof v === "string" ? v : fallback;
}

export function num(data: unknown, path: string, fallback = 0): number {
  const v = getPath(data, path);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

export function list(data: unknown, path: string): BlockData[] {
  const v = getPath(data, path);
  return Array.isArray(v) ? (v.filter((x) => x !== null && typeof x === "object") as BlockData[]) : [];
}

/* ───────────── section registry ───────────── */

export type FieldKind = "text" | "textarea" | "image" | "url" | "number" | "select";
export type BlockField =
  | { key: string; label: string; kind: FieldKind; options?: string[] | undefined; help?: string | undefined }
  | { key: string; label: string; kind: "list"; itemLabel: string; fields: BlockField[] };

export type BlockSpec = {
  type: string;
  label: string;
  /** CMS modules this section reads (prefetched on the server for SEO and speed). */
  collections?: CollectionName[];
  usesEvents?: boolean;
  fields: BlockField[];
};

const f = (key: string, label: string, kind: FieldKind = "text", extra: { options?: string[]; help?: string } = {}): BlockField => ({
  key,
  label,
  kind,
  ...extra,
});

const heading = [f("eyebrow", "Small heading above the title"), f("title", "Title")];
const CATEGORY_FILTER = ["all", "Music", "Comedy", "Film", "Other"];
const GALLERY_FILTER = ["all", "Concert", "Film", "Event", "Behind the scenes"];

export const BLOCK_SPECS: BlockSpec[] = [
  {
    type: "hero",
    label: "Hero banner (home)",
    fields: [
      ...heading,
      f("subtitle", "Supporting text", "textarea"),
      f("image", "Background image", "image"),
      f("videoUrl", "Background video URL (.mp4)", "url", { help: "Optional. Plays muted behind the text." }),
      f("cta1Text", "Primary button text"),
      f("cta1Link", "Primary button link", "url"),
      f("cta2Text", "Secondary button text"),
      f("cta2Link", "Secondary button link", "url"),
    ],
  },
  {
    type: "pagehero",
    label: "Page banner",
    fields: [...heading, f("subtitle", "Supporting text", "textarea"), f("image", "Background image", "image")],
  },
  {
    type: "about",
    label: "About (short)",
    fields: [
      ...heading,
      f("body", "Text", "textarea"),
      f("image", "Image", "image"),
      f("linkText", "Link text"),
      f("linkHref", "Link", "url"),
    ],
  },
  {
    type: "richtext",
    label: "Text with image",
    fields: [
      ...heading,
      f("body", "Text", "textarea"),
      f("image", "Image", "image"),
      f("imageSide", "Image side", "select", { options: ["right", "left"] }),
    ],
  },
  {
    type: "services",
    label: "Our expertise (services)",
    collections: ["services"],
    fields: [...heading, f("intro", "Intro text")],
  },
  {
    type: "productions",
    label: "Featured productions (movies)",
    collections: ["movies"],
    fields: [
      ...heading,
      f("limit", "How many to show (0 = all)", "number"),
      f("linkText", "Link text"),
      f("linkHref", "Link", "url"),
    ],
  },
  {
    type: "events",
    label: "Upcoming events (live from booking system)",
    usesEvents: true,
    fields: [
      ...heading,
      f("types", "Event types", "select", {
        options: ["all", "movie", "concert,festival,live_show", "live_show", "concert", "theatre", "festival", "other"],
        help: "Which kinds of events from the booking system appear here.",
      }),
      f("limit", "How many to show (0 = all)", "number"),
      f("ctaText", "Book button text"),
      f("linkText", "Link text"),
      f("linkHref", "Link", "url"),
    ],
  },
  {
    type: "artists",
    label: "Featured artists",
    collections: ["artists"],
    fields: [...heading, f("category", "Show category", "select", { options: CATEGORY_FILTER })],
  },
  { type: "videos", label: "Video gallery / showreel", collections: ["gallery_videos"], fields: heading },
  {
    type: "portfolio",
    label: "Portfolio",
    collections: ["portfolio"],
    fields: [
      ...heading,
      f("limit", "How many to show (0 = all)", "number"),
      f("linkText", "Link text"),
      f("linkHref", "Link", "url"),
    ],
  },
  {
    type: "gallery",
    label: "Photo gallery (with lightbox)",
    collections: ["gallery_photos"],
    fields: [...heading, f("category", "Start on category", "select", { options: GALLERY_FILTER })],
  },
  {
    type: "why",
    label: "Feature list",
    fields: [
      ...heading,
      {
        key: "items",
        label: "Items",
        kind: "list",
        itemLabel: "item",
        fields: [f("title", "Title"), f("description", "Description", "textarea")],
      },
    ],
  },
  {
    type: "timeline",
    label: "Journey / timeline",
    fields: [
      ...heading,
      {
        key: "items",
        label: "Milestones",
        kind: "list",
        itemLabel: "milestone",
        fields: [f("year", "Year"), f("title", "Title"), f("description", "Description", "textarea")],
      },
    ],
  },
  { type: "team", label: "Team", collections: ["team"], fields: heading },
  {
    type: "partners",
    label: "Partners & testimonials",
    collections: ["sponsors", "testimonials"],
    fields: heading,
  },
  { type: "releases", label: "Music releases", collections: ["music_releases"], fields: heading },
  {
    type: "cta",
    label: "Call to action",
    fields: [
      f("title", "Title"),
      f("text", "Text", "textarea"),
      f("buttonText", "Button text"),
      f("buttonLink", "Button link", "url"),
      f("image", "Background image", "image"),
    ],
  },
  {
    type: "enquiry",
    label: "Enquiry form",
    fields: [
      ...heading,
      f("intro", "Intro text", "textarea"),
      f("kind", "Enquiry type", "select", {
        options: ["business", "event_booking", "production_collab", "music_production", "event_management", "contact"],
        help: '"contact" lets the visitor choose between business, event booking and production collaboration.',
      }),
      f("submitText", "Button text"),
    ],
  },
  { type: "contact", label: "Contact details & map", fields: heading },
];

export const BLOCK_SPEC_BY_TYPE: Record<string, BlockSpec> = Object.fromEntries(BLOCK_SPECS.map((s) => [s.type, s]));

/** Starting content for a newly added section. */
export function defaultBlockData(type: string): BlockData {
  const all = defaults.blocks as unknown as Record<string, BlockData>;
  return structuredClone(all[type] ?? {});
}

/** Collections and flags a page needs, so the server can prefetch them for the first render. */
export function needsFor(types: string[]): { collections: CollectionName[]; events: boolean } {
  const collections = new Set<CollectionName>();
  let events = false;
  for (const t of types) {
    const spec = BLOCK_SPEC_BY_TYPE[t];
    spec?.collections?.forEach((c) => collections.add(c));
    if (spec?.usesEvents) events = true;
  }
  return { collections: [...collections], events };
}
