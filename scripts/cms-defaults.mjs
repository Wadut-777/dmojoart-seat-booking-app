// Default (dummy) CMS content. Everything here is placeholder copy that administrators replace from the
// admin panel. Seeding is idempotent: each part is inserted only when its table/key is still empty, so
// re-running db-setup never overwrites edits.
//
// Images/videos are intentionally empty strings: the site renders a neutral cinematic placeholder until
// real media is chosen from the media library.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const settings = {
  brand: {
    name: "D Mojo Art",
    tagline: "We create experiences. We make moments unforgettable.",
    logo: "",
    logoText: "D MOJO ART",
  },
  theme: {
    accent: "#e5b84b",
    accentSoft: "#f3d98a",
    background: "#0b0b0d",
    surface: "#16161a",
  },
  nav: [
    { label: "Home", href: "/", enabled: true },
    { label: "About", href: "/about", enabled: true },
    { label: "Music & Live", href: "/music", enabled: true },
    { label: "Film", href: "/film", enabled: true },
    { label: "Music Production", href: "/music-production", enabled: true },
    { label: "Event Management", href: "/event-management", enabled: true },
    { label: "Comedy", href: "/comedy", enabled: true },
    { label: "Events", href: "/events", enabled: true },
    { label: "Portfolio", href: "/portfolio", enabled: true },
    { label: "Contact", href: "/contact", enabled: true },
  ],
  footer: {
    intro: "Placeholder: D Mojo Art is an entertainment production and event management company.",
    copyright: "© D Mojo Art. All rights reserved.",
    newsletterTitle: "Stay in the loop",
    newsletterText: "Get news on upcoming shows and releases.",
  },
  social: [
    { label: "Instagram", url: "" },
    { label: "YouTube", url: "" },
    { label: "Facebook", url: "" },
  ],
  contact: {
    email: "hello@example.com",
    phone: "+91 00000 00000",
    address: "Placeholder address, City, State",
    hours: "Mon–Sat, 10:00–18:00",
    mapEmbedUrl: "",
  },
  analytics: { gaId: "", searchConsoleToken: "" },
};

const pages = [
  ["home", "Home", "D Mojo Art — Concerts, Films & Live Entertainment", "Entertainment production and event management: live music, film, comedy and unforgettable events."],
  ["about", "About Us", "About D Mojo Art", "Our story, vision, mission and the team behind D Mojo Art."],
  ["music", "Music & Live Shows", "Music & Live Shows — D Mojo Art", "Concerts, music shows and live performances produced by D Mojo Art."],
  ["film", "Film & Movie Production", "Film Production — D Mojo Art", "Feature films and productions by D Mojo Art."],
  ["music-production", "Music Production", "Music Production — D Mojo Art", "Recording, composition, audio production and artist collaboration."],
  ["event-management", "Event Management", "Event Management — D Mojo Art", "Corporate events, festivals, concerts and brand activations, end to end."],
  ["comedy", "Stand-up Comedy", "Stand-up Comedy Shows — D Mojo Art", "Upcoming stand-up comedy shows, comedians and highlights."],
  ["portfolio", "Portfolio & Gallery", "Portfolio & Gallery — D Mojo Art", "Photos and videos from our concerts, films and events."],
  ["contact", "Contact Us", "Contact — D Mojo Art", "Get in touch for events, productions and collaborations."],
];

const lorem = "Placeholder text. Replace this description from the admin panel.";
const many = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1));

const collections = {
  services: [
    ["Music & Live Concerts", "music", "/music"],
    ["Film & Movie Production", "film", "/film"],
    ["Music Production", "mic", "/music-production"],
    ["Event Management", "calendar", "/event-management"],
    ["Stand-up Comedy", "laugh", "/comedy"],
    ["Artist & Talent Management", "users", "/contact"],
  ].map(([title, icon, link]) => ({ title, icon, link, description: lorem, image: "" })),
  artists: many(4, (n) => ({
    title: `Featured Artist ${n}`,
    category: n % 2 ? "Music" : "Comedy",
    subtitle: n % 2 ? "Genre placeholder" : "Stand-up comedian",
    description: lorem,
    image: "",
    instagram: "",
    youtube: "",
    website: "",
  })),
  movies: many(3, (n) => ({
    title: `Featured Production ${n}`,
    year: "2026",
    category: "Feature Film",
    description: lorem,
    image: "",
    trailer: "",
    cast: "Cast placeholder",
    crew: "Crew placeholder",
    link: "",
  })),
  music_releases: many(3, (n) => ({
    title: `Release ${n}`,
    subtitle: "Artist placeholder",
    year: "2026",
    description: lorem,
    image: "",
    link: "",
  })),
  portfolio: many(6, (n) => ({
    title: `Project ${n}`,
    category: ["Concert", "Film", "Music", "Event", "Comedy", "Concert"][n - 1],
    year: "2026",
    description: lorem,
    image: "",
    link: "",
  })),
  gallery_photos: many(8, (n) => ({
    title: `Photo ${n}`,
    category: ["Concert", "Film", "Event", "Behind the scenes"][n % 4],
    image: "",
  })),
  gallery_videos: many(3, (n) => ({
    title: `Video ${n}`,
    category: ["Concert", "Film", "Behind the scenes"][n - 1],
    video: "",
    image: "",
  })),
  testimonials: many(3, (n) => ({
    title: `Client ${n}`,
    subtitle: "Role, Company",
    description: "Placeholder testimonial. Replace with a real client quote.",
    image: "",
  })),
  sponsors: many(6, (n) => ({ title: `Partner ${n}`, image: "", link: "" })),
  team: many(4, (n) => ({
    title: `Team Member ${n}`,
    subtitle: "Role",
    description: lorem,
    image: "",
  })),
};

/** @param db an open mysql2 connection */
export async function seedCmsDefaults(db) {
  for (const [key, value] of Object.entries(settings)) {
    await db.query("INSERT IGNORE INTO site_settings (setting_key, setting_value) VALUES (?, ?)", [
      key,
      JSON.stringify(value),
    ]);
  }
  for (const [slug, title, metaTitle, metaDescription] of pages) {
    await db.query(
      "INSERT IGNORE INTO cms_pages (slug, title, meta_title, meta_description) VALUES (?, ?, ?, ?)",
      [slug, title, metaTitle, metaDescription],
    );
  }
  let created = 0;
  for (const [collection, items] of Object.entries(collections)) {
    const [[row]] = await db.query("SELECT COUNT(*) AS n FROM cms_items WHERE collection = ?", [collection]);
    if (Number(row.n) > 0) continue;
    for (const [position, data] of items.entries()) {
      await db.query(
        "INSERT INTO cms_items (id, collection, position, data, is_published) VALUES (?, ?, ?, ?, 1)",
        [randomUUID(), collection, position, JSON.stringify(data)],
      );
      created += 1;
    }
  }

  // Default sections for each page, published immediately. Skipped for any page that already has sections,
  // so edits made in the admin are never overwritten.
  const here = dirname(fileURLToPath(import.meta.url));
  const layout = JSON.parse(await readFile(join(here, "..", "src", "lib", "cms-defaults.json"), "utf8"));
  let sections = 0;
  for (const [slug, entries] of Object.entries(layout.layouts)) {
    const page = `cms:${slug}`;
    const [[row]] = await db.query("SELECT COUNT(*) AS n FROM page_blocks WHERE page = ?", [page]);
    if (Number(row.n) > 0) continue;
    for (const [position, entry] of entries.entries()) {
      const type = typeof entry === "string" ? entry : entry.type;
      const override = typeof entry === "string" ? {} : (entry.data ?? {});
      const data = JSON.stringify({ ...structuredClone(layout.blocks[type] ?? {}), ...override });
      await db.query(
        `INSERT INTO page_blocks (id, page, position, block_type, data, published_data, published_position, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [randomUUID(), page, position, type, data, data, position],
      );
      sections += 1;
    }
  }
  console.log(`cms defaults ready (${created} new placeholder items, ${sections} new page sections)`);
}
