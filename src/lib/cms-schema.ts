/**
 * Shared (browser + server) description of CMS content modules and site settings.
 * The admin forms are generated from COLLECTIONS, so adding a field here adds it to the editor.
 */

export const COLLECTION_NAMES = [
  "artists",
  "movies",
  "music_releases",
  "services",
  "portfolio",
  "gallery_photos",
  "gallery_videos",
  "testimonials",
  "sponsors",
  "team",
] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];

export type FieldType = "text" | "textarea" | "image" | "url" | "select" | "number";
export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  help?: string;
};
export type CollectionSpec = { name: CollectionName; label: string; singular: string; fields: FieldSpec[] };

const t = (key: string, label: string, type: FieldType = "text", extra: Partial<FieldSpec> = {}): FieldSpec => ({
  key,
  label,
  type,
  ...extra,
});

export const COLLECTIONS: CollectionSpec[] = [
  {
    name: "artists",
    label: "Artists",
    singular: "artist",
    fields: [
      t("title", "Name"),
      t("category", "Category", "select", { options: ["Music", "Comedy", "Film", "Other"] }),
      t("subtitle", "Genre / speciality"),
      t("description", "Short profile", "textarea"),
      t("image", "Photo", "image"),
      t("instagram", "Instagram URL", "url"),
      t("youtube", "YouTube URL", "url"),
      t("website", "Website URL", "url"),
    ],
  },
  {
    name: "movies",
    label: "Movies",
    singular: "movie",
    fields: [
      t("title", "Title"),
      t("year", "Year"),
      t("category", "Genre / category"),
      t("description", "Synopsis", "textarea"),
      t("image", "Poster", "image"),
      t("trailer", "Trailer URL (YouTube/Vimeo)", "url"),
      t("cast", "Cast", "textarea"),
      t("crew", "Crew", "textarea"),
      t("link", "Details link", "url"),
    ],
  },
  {
    name: "music_releases",
    label: "Music releases",
    singular: "release",
    fields: [
      t("title", "Title"),
      t("subtitle", "Artist"),
      t("year", "Year"),
      t("description", "Notes", "textarea"),
      t("image", "Cover", "image"),
      t("link", "Listen / watch URL", "url"),
    ],
  },
  {
    name: "services",
    label: "Services",
    singular: "service",
    fields: [
      t("title", "Title"),
      t("description", "Description", "textarea"),
      t("icon", "Icon", "select", { options: ["music", "film", "mic", "calendar", "laugh", "users", "star"] }),
      t("image", "Image", "image"),
      t("link", "Page link", "url"),
    ],
  },
  {
    name: "portfolio",
    label: "Portfolio",
    singular: "project",
    fields: [
      t("title", "Title"),
      t("category", "Category", "select", { options: ["Concert", "Film", "Music", "Event", "Comedy"] }),
      t("year", "Year"),
      t("description", "Description", "textarea"),
      t("image", "Image", "image"),
      t("link", "Link", "url"),
    ],
  },
  {
    name: "gallery_photos",
    label: "Photo gallery",
    singular: "photo",
    fields: [
      t("title", "Caption"),
      t("category", "Category", "select", { options: ["Concert", "Film", "Event", "Behind the scenes"] }),
      t("image", "Photo", "image"),
    ],
  },
  {
    name: "gallery_videos",
    label: "Video gallery",
    singular: "video",
    fields: [
      t("title", "Title"),
      t("category", "Category", "select", { options: ["Concert", "Film", "Event", "Behind the scenes"] }),
      t("video", "YouTube / Vimeo URL", "url"),
      t("image", "Thumbnail", "image"),
    ],
  },
  {
    name: "testimonials",
    label: "Testimonials",
    singular: "testimonial",
    fields: [
      t("title", "Person"),
      t("subtitle", "Role / company"),
      t("description", "Quote", "textarea"),
      t("image", "Photo", "image"),
    ],
  },
  {
    name: "sponsors",
    label: "Sponsors & partners",
    singular: "partner",
    fields: [t("title", "Name"), t("image", "Logo", "image"), t("link", "Website", "url")],
  },
  {
    name: "team",
    label: "Team",
    singular: "team member",
    fields: [
      t("title", "Name"),
      t("subtitle", "Role"),
      t("description", "Bio", "textarea"),
      t("image", "Photo", "image"),
    ],
  },
];

export const SETTING_KEYS = ["brand", "theme", "nav", "footer", "social", "contact", "analytics"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export type NavItem = { label: string; href: string; enabled: boolean };
export type SiteSettings = {
  brand: { name: string; tagline: string; logo: string; logoText: string };
  theme: { accent: string; accentSoft: string; background: string; surface: string };
  nav: NavItem[];
  footer: { intro: string; copyright: string; newsletterTitle: string; newsletterText: string };
  social: { label: string; url: string }[];
  contact: { email: string; phone: string; address: string; hours: string; mapEmbedUrl: string };
  analytics: { gaId: string; searchConsoleToken: string };
};

export const ENQUIRY_KINDS = [
  "business",
  "event_booking",
  "production_collab",
  "music_production",
  "event_management",
  "newsletter",
] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

/** Page slugs managed by the CMS (page body = page_blocks rows with page = "cms:<slug>"). */
export const CMS_PAGE_SLUGS = [
  "home",
  "about",
  "music",
  "film",
  "music-production",
  "event-management",
  "comedy",
  "portfolio",
  "contact",
] as const;
export type CmsPageSlug = (typeof CMS_PAGE_SLUGS)[number];
