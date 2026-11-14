import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SETTINGS_KEY, mergeSettings } from "@/components/cms/data";
import { readableError } from "@/components/cms/forms";
import {
  adminListAuditLogs,
  adminListCmsPages,
  adminListCollection,
  adminListEnquiries,
  createCmsPage,
  deleteCmsPage,
  deleteCollectionItem,
  getSiteSettings,
  moveCmsPage,
  reorderCmsPages,
  reorderCollection,
  saveCmsPage,
  saveCollectionItem,
  saveSiteSetting,
  setEnquiryStatus,
  type CmsItem,
  type CmsPage,
} from "@/lib/cms.functions";
import { COLLECTIONS, type CollectionSpec, type FooterColumn, type FooterLink, type FieldSpec, type SettingKey, type SiteSettings } from "@/lib/cms-schema";
import { mediaUrl, uploadMedia } from "@/lib/media";

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const btn = "rounded-full border border-border px-4 py-1.5 text-xs font-bold hover:bg-muted";
const gold = "gold-surface rounded-full px-5 py-2 text-sm font-bold disabled:opacity-50";

type SubTab = "settings" | "modules" | "pages" | "enquiries" | "activity";

export function CmsAdmin({ roles }: { roles: string[] }) {
  const isAdmin = roles.includes("admin");
  const canContent = isAdmin || roles.includes("editor");
  const subs: { id: SubTab; label: string }[] = [
    ...(canContent ? [{ id: "settings" as const, label: "Site settings" }, { id: "modules" as const, label: "Content modules" }, { id: "pages" as const, label: "Pages & SEO" }] : []),
    { id: "enquiries" as const, label: "Enquiries" },
    ...(isAdmin ? [{ id: "activity" as const, label: "Activity log" }] : []),
  ];
  const [sub, setSub] = useState<SubTab>(subs[0]?.id ?? "enquiries");
  return (
    <section className="panel space-y-6 p-6 md:p-8">
      <div>
        <h2 className="text-2xl">Website content</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Page text and sections are edited directly on each page while signed in (click any text, or use the bar at the bottom). Everything else is here.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {subs.map((s) => (
          <button key={s.id} onClick={() => setSub(s.id)} className={sub === s.id ? "gold-surface rounded-full px-4 py-1.5 text-xs font-bold" : btn}>
            {s.label}
          </button>
        ))}
      </div>
      {sub === "settings" && canContent && <SettingsEditor />}
      {sub === "modules" && canContent && <ModulesEditor />}
      {sub === "pages" && canContent && <PagesEditor />}
      {sub === "enquiries" && <EnquiriesList />}
      {sub === "activity" && isAdmin && <ActivityLog />}
    </section>
  );
}

/* ───────────── small controls ───────────── */

function Upload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const url = mediaUrl(value);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {url && <img src={url} alt="" className="h-14 w-14 border border-border object-cover" />}
      <label className={btn + " cursor-pointer"}>
        {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              onChange(await uploadMedia(file, "blocks"));
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {value && (
        <button type="button" className={btn} onClick={() => onChange("")}>
          Remove
        </button>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* ───────────── site settings ───────────── */

function SettingsEditor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => getSiteSettings() });
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [saving, setSaving] = useState<SettingKey | null>(null);
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const s: SiteSettings = draft ?? mergeSettings(q.data);
  const patch = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => setDraft({ ...s, [key]: value });

  async function save(key: SettingKey) {
    setSaving(key);
    try {
      await saveSiteSetting({ data: { key, value: s[key] as never } });
      await qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      toast.success("Saved.");
    } catch (e) {
      toast.error(readableError(e));
    } finally {
      setSaving(null);
    }
  }

  const group = (key: SettingKey, title: string, body: React.ReactNode) => (
    <fieldset className="space-y-4 border border-border p-5">
      <legend className="px-2 text-sm font-bold uppercase tracking-[0.2em]">{title}</legend>
      {body}
      <button type="button" disabled={saving === key} onClick={() => void save(key)} className={gold}>
        {saving === key ? "Saving…" : `Save ${title.toLowerCase()}`}
      </button>
    </fieldset>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {group(
        "brand",
        "Brand",
        <>
          <Labeled label="Brand name">
            <input className={input} value={s.brand.name} onChange={(e) => patch("brand", { ...s.brand, name: e.target.value })} />
          </Labeled>
          <Labeled label="Text logo (used when no logo image)">
            <input className={input} value={s.brand.logoText} onChange={(e) => patch("brand", { ...s.brand, logoText: e.target.value })} />
          </Labeled>
          <Labeled label="Tagline (default page description)">
            <input className={input} value={s.brand.tagline} onChange={(e) => patch("brand", { ...s.brand, tagline: e.target.value })} />
          </Labeled>
          <Labeled label="Logo image">
            <Upload value={s.brand.logo} onChange={(v) => patch("brand", { ...s.brand, logo: v })} />
          </Labeled>
        </>,
      )}
      {group(
        "theme",
        "Colours",
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["accent", "Accent (buttons, links)"],
              ["accentSoft", "Accent (light end)"],
              ["highlight", "Highlight (dots, small accents)"],
              ["background", "Page background"],
              ["surface", "Cards / surfaces"],
            ] as const
          ).map(([k, label]) => (
            <Labeled key={k} label={label}>
              <input
                type="color"
                className="h-10 w-full cursor-pointer border border-input bg-background"
                value={/^#[0-9a-fA-F]{6}$/.test(s.theme[k]) ? s.theme[k] : "#000000"}
                onChange={(e) => patch("theme", { ...s.theme, [k]: e.target.value })}
              />
            </Labeled>
          ))}
        </div>,
      )}
      {group(
        "nav",
        "Navigation menu",
        <div className="space-y-2">
          {s.nav.map((n, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <input aria-label="Label" className={input} value={n.label} onChange={(e) => patch("nav", s.nav.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input aria-label="Link" className={input} value={n.href} onChange={(e) => patch("nav", s.nav.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
              <div className="flex items-center gap-1">
                <input aria-label="Show in menu" type="checkbox" checked={n.enabled} onChange={(e) => patch("nav", s.nav.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} />
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => patch("nav", move(s.nav, i, -1))}>
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" aria-label="Move down" disabled={i === s.nav.length - 1} onClick={() => patch("nav", move(s.nav, i, 1))}>
                  <ArrowDown className="size-4" />
                </button>
                <button type="button" aria-label="Remove" onClick={() => patch("nav", s.nav.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
          <button type="button" className={btn} onClick={() => patch("nav", [...s.nav, { label: "New link", href: "/", enabled: true }])}>
            <Plus className="mr-1 inline size-3" /> Add link
          </button>
        </div>,
      )}
      {group(
        "footer",
        "Footer",
        <>
          <Labeled label="Introduction">
            <textarea rows={3} className={input} value={s.footer.intro} onChange={(e) => patch("footer", { ...s.footer, intro: e.target.value })} />
          </Labeled>
          <Labeled label="Copyright line">
            <input className={input} value={s.footer.copyright} onChange={(e) => patch("footer", { ...s.footer, copyright: e.target.value })} />
          </Labeled>
          <Labeled label="Newsletter title">
            <input className={input} value={s.footer.newsletterTitle} onChange={(e) => patch("footer", { ...s.footer, newsletterTitle: e.target.value })} />
          </Labeled>
          <Labeled label="Newsletter text">
            <input className={input} value={s.footer.newsletterText} onChange={(e) => patch("footer", { ...s.footer, newsletterText: e.target.value })} />
          </Labeled>
          <Labeled label="Newsletter text">
            <input className={input} value={s.footer.newsletterText} onChange={(e) => patch("footer", { ...s.footer, newsletterText: e.target.value })} />
          </Labeled>
          <FooterLinksEditor s={s} patch={patch} />
        </>,
      )}
      {group(
        "social",
        "Social media links",
        <div className="space-y-2">
          {s.social.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
              <input aria-label="Network" className={input} value={l.label} onChange={(e) => patch("social", s.social.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input aria-label="URL" className={input} placeholder="https://…" value={l.url} onChange={(e) => patch("social", s.social.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button type="button" aria-label="Remove" onClick={() => patch("social", s.social.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button type="button" className={btn} onClick={() => patch("social", [...s.social, { label: "", url: "" }])}>
            <Plus className="mr-1 inline size-3" /> Add link
          </button>
          <p className="text-xs text-muted-foreground">Links with an empty URL are hidden on the site.</p>
        </div>,
      )}
      {group(
        "contact",
        "Contact details",
        <>
          {(
            [
              ["email", "Email"],
              ["phone", "Phone"],
              ["hours", "Opening hours"],
              ["mapEmbedUrl", "Google Maps embed URL"],
            ] as const
          ).map(([k, label]) => (
            <Labeled key={k} label={label}>
              <input className={input} value={s.contact[k]} onChange={(e) => patch("contact", { ...s.contact, [k]: e.target.value })} />
            </Labeled>
          ))}
          <Labeled label="Address">
            <textarea rows={3} className={input} value={s.contact.address} onChange={(e) => patch("contact", { ...s.contact, address: e.target.value })} />
          </Labeled>
          <p className="text-xs text-muted-foreground">
            Map: in Google Maps choose Share → Embed a map, then paste only the link inside src="…" (it starts with https://www.google.com/maps/embed).
          </p>
        </>,
      )}
      {group(
        "analytics",
        "Analytics & search",
        <>
          <Labeled label="Google Analytics ID (G-XXXXXXXXXX)">
            <input className={input} value={s.analytics.gaId} onChange={(e) => patch("analytics", { ...s.analytics, gaId: e.target.value.trim() })} />
          </Labeled>
          <Labeled label="Search Console verification token">
            <input className={input} value={s.analytics.searchConsoleToken} onChange={(e) => patch("analytics", { ...s.analytics, searchConsoleToken: e.target.value.trim() })} />
          </Labeled>
        </>,
      )}
    </div>
  );
}

/** Footer link sections ("Explore"-style), small bottom links and show/hide switches. */
function FooterLinksEditor({ s, patch }: { s: SiteSettings; patch: <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => void }) {
  const pagesQ = useQuery({ queryKey: ["admin-cms-pages"], queryFn: () => adminListCmsPages() });
  const f = s.footer;
  // Until the footer has been customised it shows "Explore" built from the menu; start the editor from that.
  const columns: FooterColumn[] = f.columns ?? [{ title: "Explore", links: s.nav.filter((n) => n.enabled).map((n) => ({ label: n.label, href: n.href })) }];
  const bottom: FooterLink[] = f.bottomLinks ?? [];
  const setFooter = (next: Partial<SiteSettings["footer"]>) => patch("footer", { ...f, ...next });
  const setColumns = (c: FooterColumn[]) => setFooter({ columns: c });
  const setLinks = (ci: number, links: FooterLink[]) => setColumns(columns.map((c, i) => (i === ci ? { ...c, links } : c)));

  // Pages that can be linked from the footer: every CMS page plus the booking and listing pages.
  const pageChoices = [
    ...(pagesQ.data ?? []).map((p) => ({ label: p.title, href: p.path })),
    { label: "Book tickets", href: "/prebook" },
    { label: "Events", href: "/events" },
    { label: "Productions", href: "/productions" },
  ].filter((p, i, all) => all.findIndex((x) => x.href === p.href) === i);

  const pagePicker = (onPick: (l: FooterLink) => void) => (
    <select
      aria-label="Add a page link"
      className={input + " w-auto"}
      value=""
      onChange={(e) => {
        const choice = pageChoices.find((p) => p.href === e.target.value);
        if (choice) onPick(choice);
      }}
    >
      <option value="">+ Add a page…</option>
      {pageChoices.map((p) => (
        <option key={p.href} value={p.href}>
          {p.label} ({p.href})
        </option>
      ))}
    </select>
  );

  const linkRow = (l: FooterLink, onChange: (l: FooterLink) => void, onMove: (by: number) => void, onRemove: () => void, first: boolean, last: boolean) => (
    <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
      <input aria-label="Link text" className={input} value={l.label} onChange={(e) => onChange({ ...l, label: e.target.value })} />
      <input aria-label="Link address" className={input} placeholder="/page or https://…" value={l.href} onChange={(e) => onChange({ ...l, href: e.target.value })} />
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Move up" disabled={first} onClick={() => onMove(-1)}>
          <ArrowUp className="size-4" />
        </button>
        <button type="button" aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
          <ArrowDown className="size-4" />
        </button>
        <button type="button" aria-label="Remove link" onClick={onRemove}>
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Link sections</p>
        {columns.map((c, ci) => (
          <div key={ci} className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <input aria-label="Section title" className={input + " font-semibold"} placeholder="Section title (e.g. Explore)" value={c.title} onChange={(e) => setColumns(columns.map((x, i) => (i === ci ? { ...x, title: e.target.value } : x)))} />
              <button type="button" aria-label="Move section up" disabled={ci === 0} onClick={() => setColumns(move(columns, ci, -1))}>
                <ArrowUp className="size-4" />
              </button>
              <button type="button" aria-label="Move section down" disabled={ci === columns.length - 1} onClick={() => setColumns(move(columns, ci, 1))}>
                <ArrowDown className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Delete section"
                onClick={() => {
                  if (window.confirm(`Delete the footer section “${c.title || "untitled"}”?`)) setColumns(columns.filter((_, i) => i !== ci));
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            {c.links.map((l, li) =>
              linkRow(
                l,
                (next) => setLinks(ci, c.links.map((x, j) => (j === li ? next : x))),
                (by) => setLinks(ci, move(c.links, li, by)),
                () => setLinks(ci, c.links.filter((_, j) => j !== li)),
                li === 0,
                li === c.links.length - 1,
              ),
            )}
            <div className="flex flex-wrap items-center gap-2">
              {pagePicker((l) => setLinks(ci, [...c.links, l]))}
              <button type="button" className={btn} onClick={() => setLinks(ci, [...c.links, { label: "", href: "" }])}>
                <Plus className="mr-1 inline size-3" /> Custom link
              </button>
            </div>
          </div>
        ))}
        <button type="button" className={btn} onClick={() => setColumns([...columns, { title: "New section", links: [] }])}>
          <Plus className="mr-1 inline size-3" /> Add section
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Bottom bar links (Privacy, Terms…)</p>
        {bottom.map((l, i) =>
          linkRow(
            l,
            (next) => setFooter({ bottomLinks: bottom.map((x, j) => (j === i ? next : x)) }),
            (by) => setFooter({ bottomLinks: move(bottom, i, by) }),
            () => setFooter({ bottomLinks: bottom.filter((_, j) => j !== i) }),
            i === 0,
            i === bottom.length - 1,
          ),
        )}
        <div className="flex flex-wrap items-center gap-2">
          {pagePicker((l) => setFooter({ bottomLinks: [...bottom, l] }))}
          <button type="button" className={btn} onClick={() => setFooter({ bottomLinks: [...bottom, { label: "", href: "" }] })}>
            <Plus className="mr-1 inline size-3" /> Custom link
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.showContact !== false} onChange={(e) => setFooter({ showContact: e.target.checked })} /> Show contact details
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.showNewsletter !== false} onChange={(e) => setFooter({ showNewsletter: e.target.checked })} /> Show newsletter sign-up
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.showAdminLink !== false} onChange={(e) => setFooter({ showAdminLink: e.target.checked })} /> Show “Admin” link in the bottom bar
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Contact details and social links come from their own settings below. Press “Save footer” to publish the changes.</p>
    </div>
  );
}

function move<T>(arr: T[], i: number, by: number): T[] {
  const next = [...arr];
  const j = i + by;
  if (j < 0 || j >= next.length) return arr;
  [next[i], next[j]] = [next[j] as T, next[i] as T];
  return next;
}

/* ───────────── content modules ───────────── */

function ModulesEditor() {
  const [name, setName] = useState<CollectionSpec["name"]>(COLLECTIONS[0]!.name);
  const spec = COLLECTIONS.find((c) => c.name === name)!;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {COLLECTIONS.map((c) => (
          <button key={c.name} onClick={() => setName(c.name)} className={name === c.name ? "gold-surface rounded-full px-4 py-1.5 text-xs font-bold" : btn}>
            {c.label}
          </button>
        ))}
      </div>
      <CollectionEditor key={name} spec={spec} />
    </div>
  );
}

function CollectionEditor({ spec }: { spec: CollectionSpec }) {
  const qc = useQueryClient();
  const key = ["admin-collection", spec.name] as const;
  const q = useQuery({ queryKey: key, queryFn: () => adminListCollection({ data: { collection: spec.name } }) });
  const [editing, setEditing] = useState<{ id?: string; isPublished: boolean; data: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: key });
    await qc.invalidateQueries({ queryKey: ["cms-collection", spec.name] });
  };
  const items = q.data ?? [];

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await saveCollectionItem({
        data: { ...(editing.id ? { id: editing.id } : {}), collection: spec.name, isPublished: editing.isPublished, data: editing.data },
      });
      setEditing(null);
      await refresh();
      toast.success("Saved.");
    } catch (e) {
      toast.error(readableError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(it: CmsItem) {
    if (!window.confirm(`Delete "${String(it.data["title"] ?? spec.singular)}"?`)) return;
    try {
      await deleteCollectionItem({ data: { id: it.id, collection: spec.name } });
      await refresh();
    } catch (e) {
      toast.error(readableError(e));
    }
  }

  async function shift(i: number, by: number) {
    const ids = move(items, i, by).map((x) => x.id);
    try {
      await reorderCollection({ data: { collection: spec.name, ids } });
      await refresh();
    } catch (e) {
      toast.error(readableError(e));
    }
  }

  if (editing) {
    return (
      <div className="space-y-4 border border-border p-5">
        <h3 className="text-lg uppercase">{editing.id ? "Edit" : "New"} {spec.singular}</h3>
        {spec.fields.map((f) => (
          <Labeled key={f.key} label={f.label}>
            <ModuleField field={f} value={String(editing.data[f.key] ?? "")} onChange={(v) => setEditing({ ...editing, data: { ...editing.data, [f.key]: v } })} />
          </Labeled>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={editing.isPublished} onChange={(e) => setEditing({ ...editing, isPublished: e.target.checked })} /> Published (visible on the website)
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => void save()} className={gold}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className={btn} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" className={gold} onClick={() => setEditing({ isPublished: true, data: {} })}>
        Add {spec.singular}
      </button>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!q.isLoading && items.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
      <ul className="divide-y divide-border border border-border">
        {items.map((it, i) => (
          <li key={it.id} className="flex flex-wrap items-center gap-3 p-3">
            {mediaUrl(String(it.data["image"] ?? "")) ? (
              <img src={mediaUrl(String(it.data["image"]))!} alt="" className="size-12 object-cover" />
            ) : (
              <span className="size-12 bg-muted" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{String(it.data["title"] ?? "Untitled")}</p>
              <p className="text-xs text-muted-foreground">{it.isPublished ? "Published" : "Hidden"}</p>
            </div>
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => void shift(i, -1)}>
              <ArrowUp className="size-4" />
            </button>
            <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => void shift(i, 1)}>
              <ArrowDown className="size-4" />
            </button>
            <button type="button" className={btn} onClick={() => setEditing({ id: it.id, isPublished: it.isPublished, data: it.data })}>
              Edit
            </button>
            <button type="button" aria-label="Delete" onClick={() => void remove(it)} className="hover:text-destructive">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModuleField({ field, value, onChange }: { field: FieldSpec; value: string; onChange: (v: string) => void }) {
  if (field.type === "textarea") return <textarea rows={4} className={input} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === "image") return <Upload value={value} onChange={onChange} />;
  if (field.type === "select") {
    return (
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return <input className={input} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/* ───────────── pages & SEO ───────────── */

function PagesEditor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-cms-pages"], queryFn: () => adminListCmsPages() });
  const [open, setOpen] = useState<CmsPage | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!open) return;
    setBusy(true);
    try {
      await saveCmsPage({
        data: {
          slug: open.slug,
          title: open.title,
          metaTitle: open.metaTitle ?? "",
          metaDescription: open.metaDescription ?? "",
          ogImage: open.ogImage ?? "",
          isPublished: open.isPublished,
        },
      });
      await qc.invalidateQueries({ queryKey: ["admin-cms-pages"] });
      setOpen(null);
      toast.success("Saved. Visitors see the change on the next page load.");
    } catch (e) {
      toast.error(readableError(e));
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return (
      <div className="max-w-xl space-y-4 border border-border p-5">
        <h3 className="text-lg uppercase">{open.title}</h3>
        <Labeled label="Page name">
          <input className={input} value={open.title} onChange={(e) => setOpen({ ...open, title: e.target.value })} />
        </Labeled>
        <Labeled label="Meta title (shown in Google and the browser tab)">
          <input className={input} maxLength={70} value={open.metaTitle ?? ""} onChange={(e) => setOpen({ ...open, metaTitle: e.target.value })} />
        </Labeled>
        <Labeled label="Meta description (about 150 characters)">
          <textarea rows={3} className={input} maxLength={300} value={open.metaDescription ?? ""} onChange={(e) => setOpen({ ...open, metaDescription: e.target.value })} />
        </Labeled>
        <Labeled label="Social sharing image">
          <Upload value={open.ogImage ?? ""} onChange={(v) => setOpen({ ...open, ogImage: v })} />
        </Labeled>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={open.isPublished} onChange={(e) => setOpen({ ...open, isPublished: e.target.checked })} /> Page settings are live
        </label>
        <div className="flex gap-2">
          <button type="button" disabled={busy} className={gold} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className={btn} onClick={() => setOpen(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const pages = q.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-cms-pages"] });
  const rows = flattenTree(pages);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      await refresh();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(readableError(e));
    }
  }

  // Swap a page with the previous/next page that has the same parent.
  function shift(page: CmsPage, dir: -1 | 1) {
    const siblings = pages.filter((x) => x.parentSlug === page.parentSlug);
    const i = siblings.findIndex((x) => x.slug === page.slug);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    const order = siblings.map((x) => x.slug);
    [order[i], order[j]] = [order[j]!, order[i]!];
    void run(() => reorderCmsPages({ data: { order } }));
  }

  // Pages a page may be moved under: not itself, not its own sub-pages, and not too deep.
  function parentChoices(page: CmsPage) {
    const blocked = new Set([page.slug, ...descendantSlugs(pages, page.slug)]);
    return rows.filter(({ page: c, depth }) => !blocked.has(c.slug) && depth < 3);
  }

  return (
    <div className="space-y-6">
      <NewPageForm pages={pages} rows={rows} onCreated={refresh} />
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {rows.map(({ page: p, depth }) => {
          const siblings = pages.filter((x) => x.parentSlug === p.parentSlug);
          const idx = siblings.findIndex((x) => x.slug === p.slug);
          return (
            <li key={p.slug} className="flex flex-wrap items-center justify-between gap-3 p-3" style={{ paddingLeft: `${0.75 + depth * 1.75}rem` }}>
              <div>
                <p className="font-semibold">
                  {p.title}
                  {p.isCustom && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[0.65rem] font-bold text-primary">New</span>}
                </p>
                <p className="text-xs text-muted-foreground">{p.path}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn} aria-label={`Move ${p.title} up`} disabled={idx <= 0} onClick={() => shift(p, -1)}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" className={btn} aria-label={`Move ${p.title} down`} disabled={idx >= siblings.length - 1} onClick={() => shift(p, 1)}>
                  <ArrowDown className="size-3.5" />
                </button>
                {p.isCustom && (
                  <select
                    aria-label={`Place ${p.title} under`}
                    className={input + " w-auto"}
                    value={p.parentSlug ?? ""}
                    onChange={(e) =>
                      void run(() => moveCmsPage({ data: { slug: p.slug, parentSlug: e.target.value || null } }), "Page moved. Its address has changed.")
                    }
                  >
                    <option value="">Top level</option>
                    {parentChoices(p).map(({ page: c, depth: d }) => (
                      <option key={c.slug} value={c.slug}>
                        {"— ".repeat(d)}Under: {c.title}
                      </option>
                    ))}
                  </select>
                )}
                <a href={p.path} className={btn}>
                  Edit page
                </a>
                <button type="button" className={btn} onClick={() => setOpen(p)}>
                  SEO settings
                </button>
                {p.isCustom && (
                  <button
                    type="button"
                    className={btn}
                    aria-label={`Delete ${p.title}`}
                    onClick={() => {
                      if (window.confirm(`Delete the page “${p.title}” and all its sections? This cannot be undone.`)) {
                        void run(() => deleteCmsPage({ data: { slug: p.slug } }), "Page deleted.");
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Use the arrows to change the order among pages at the same level. Pages you add can be placed under any other page; built-in pages keep their
        addresses. The menu at the top of the website is edited under Site settings.
      </p>
    </div>
  );
}

type Row = { page: CmsPage; depth: number };

/** Depth-first list: each page followed by its sub-pages, in the saved order. */
function flattenTree(pages: CmsPage[]): Row[] {
  const out: Row[] = [];
  const known = new Set(pages.map((p) => p.slug));
  const walk = (parent: string | null, depth: number) => {
    for (const p of pages.filter((x) => (x.parentSlug && known.has(x.parentSlug) ? x.parentSlug : null) === parent)) {
      out.push({ page: p, depth });
      walk(p.slug, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function descendantSlugs(pages: CmsPage[], slug: string): string[] {
  const kids = pages.filter((p) => p.parentSlug === slug).map((p) => p.slug);
  return kids.flatMap((k) => [k, ...descendantSlugs(pages, k)]);
}

const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

function NewPageForm({ pages, rows, onCreated }: { pages: CmsPage[]; rows: Row[]; onCreated: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parent, setParent] = useState("");
  const [menu, setMenu] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button type="button" className={gold + " inline-flex items-center gap-2"} onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add new page
      </button>
    );
  }

  const parentPage = pages.find((p) => p.slug === parent);
  const preview = `${parentPage && parentPage.path !== "/" ? parentPage.path : ""}/${slug || "page-address"}`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createCmsPage({ data: { title, slug, parentSlug: parent || null, addToMenu: menu } });
      await onCreated();
      toast.success("Page created. Opening it so you can add content.");
      window.location.assign(res.path);
    } catch (err) {
      toast.error(readableError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="max-w-xl space-y-4 rounded-2xl border border-border p-5">
      <h3 className="text-lg">Add new page</h3>
      <Labeled label="Page name">
        <input
          className={input}
          required
          maxLength={200}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </Labeled>
      <Labeled label="Web address (lowercase letters, numbers, hyphens)">
        <input
          className={input}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={60}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
        />
      </Labeled>
      <Labeled label="Place under">
        <select className={input} value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Top level</option>
          {rows
            .filter((r) => r.depth < 2)
            .map(({ page: p, depth }) => (
              <option key={p.slug} value={p.slug}>
                {"— ".repeat(depth)}
                {p.title}
              </option>
            ))}
        </select>
      </Labeled>
      <p className="text-xs text-muted-foreground">
        Address: <span className="text-foreground">{preview}</span>
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={menu} onChange={(e) => setMenu(e.target.checked)} /> Add to the main menu
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !title.trim() || !slug} className={gold}>
          {busy ? "Creating…" : "Create page"}
        </button>
        <button type="button" className={btn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ───────────── enquiries & activity ───────────── */

function EnquiriesList() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-enquiries"], queryFn: () => adminListEnquiries({ data: { limit: 200 } }) });
  const rows = q.data ?? [];
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No enquiries yet.</p>;
  return (
    <ul className="divide-y divide-border border border-border">
      {rows.map((r) => (
        <li key={r.id} className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {r.name || "(no name)"} <span className="text-xs font-normal text-muted-foreground">· {r.kind.replace(/_/g, " ")} · {new Date(r.createdAt).toLocaleString("en-IN")}</span>
            </p>
            <select
              aria-label="Status"
              value={r.status}
              className={input + " w-auto"}
              onChange={async (e) => {
                try {
                  await setEnquiryStatus({ data: { id: r.id, status: e.target.value as "new" } });
                  await qc.invalidateQueries({ queryKey: ["admin-enquiries"] });
                } catch (err) {
                  toast.error(readableError(err));
                }
              }}
            >
              <option value="new">New</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="spam">Spam</option>
            </select>
          </div>
          <p className="text-sm">
            {r.email && <a className="text-primary hover:underline" href={`mailto:${r.email}`}>{r.email}</a>}
            {r.phone && <span className="text-muted-foreground"> · {r.phone}</span>}
          </p>
          {r.message && <p className="whitespace-pre-line text-sm text-muted-foreground">{r.message}</p>}
          {Object.keys(r.extra).length > 0 && (
            <p className="text-xs text-muted-foreground">
              {Object.entries(r.extra)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActivityLog() {
  const q = useQuery({ queryKey: ["admin-audit"], queryFn: () => adminListAuditLogs() });
  const rows = q.data ?? [];
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            <th className="p-2">When</th>
            <th className="p-2">Who</th>
            <th className="p-2">Action</th>
            <th className="p-2">What</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString("en-IN")}</td>
              <td className="p-2">{r.userEmail ?? "—"}</td>
              <td className="p-2">{r.action}</td>
              <td className="p-2">{r.entity}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
