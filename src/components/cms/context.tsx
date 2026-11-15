import { Link } from "@tanstack/react-router";
import { ArrowRight, Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Pilcrow, Unlink } from "lucide-react";
import { createContext, useContext, useRef, useState, type ElementType, type ReactNode } from "react";
import { toast } from "sonner";

import { str, type BlockData } from "@/lib/cms-blocks";
import { htmlToMd, mdToHtml } from "@/lib/richtext";
import { mediaUrl, uploadMedia } from "@/lib/media";
import { cn } from "@/lib/utils";

/* ───────────── editor state (shared by every section on the page) ───────────── */

export type EditorMode = "off" | "edit" | "preview";

export type EditorApi = {
  mode: EditorMode;
  /** True when the visitor is a signed-in editor and edit chrome is showing. */
  editing: boolean;
  /** Save one field of one section (inline editing). */
  updateField: (blockId: string, path: string, value: unknown) => void;
};

const defaultEditor: EditorApi = { mode: "off", editing: false, updateField: () => undefined };
export const EditorContext = createContext<EditorApi>(defaultEditor);
export const useEditor = () => useContext(EditorContext);

/* ───────────── the section currently being rendered ───────────── */

export type BlockApi = { id: string; data: BlockData };
const BlockContext = createContext<BlockApi>({ id: "", data: {} });
export const useBlock = () => useContext(BlockContext);

export function BlockProvider({ value, children }: { value: BlockApi; children: ReactNode }) {
  return <BlockContext.Provider value={value}>{children}</BlockContext.Provider>;
}

/* ───────────── inline-editable pieces ───────────── */

/** Text from the current section. Editors can click it and type; everyone else just reads it. */
export function T({
  k,
  as = "span",
  className,
  multiline = false,
  format = "basic",
}: {
  k: string;
  as?: ElementType;
  className?: string;
  /** Multi-line text supports basic formatting (bold, italic, links, lists). */
  multiline?: boolean;
  /** "document" adds heading buttons, for long pages such as privacy policy and terms. */
  format?: "basic" | "document";
}) {
  const { id, data } = useBlock();
  const ed = useEditor();
  const Tag = as;
  const value = str(data, k);

  if (multiline) return <RichField k={k} className={className} format={format} />;

  if (!ed.editing) return value ? <Tag className={className}>{value}</Tag> : null;

  return (
    <Tag
      className={cn(className, "min-w-8 cursor-text outline-dashed outline-1 outline-offset-2 outline-primary/70")}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = e.currentTarget.innerText.trim();
        if (next !== value) ed.updateField(id, k, next);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {value || "Click to edit"}
    </Tag>
  );
}

/** Formatted text block: shown as formatted text to visitors; editors get a small formatting toolbar. */
function RichField({ k, className, format }: { k: string; className?: string | undefined; format: "basic" | "document" }) {
  const { id, data } = useBlock();
  const ed = useEditor();
  const value = str(data, k);
  const [focused, setFocused] = useState(false);
  const html = mdToHtml(value);

  if (!ed.editing) return html ? <div className={cn("rich", className)} dangerouslySetInnerHTML={{ __html: html }} /> : null;

  return (
    <div className="relative">
      {focused && <FormatBar format={format} />}
      <div
        className={cn("rich rich-edit", className, "min-h-8 cursor-text outline-dashed outline-1 outline-offset-2 outline-primary/70")}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setFocused(true)}
        onBlur={(e: React.FocusEvent<HTMLDivElement>) => {
          setFocused(false);
          const next = htmlToMd(e.currentTarget);
          if (next !== value) ed.updateField(id, k, next);
        }}
        // Paste as plain text so copied web pages and Word files cannot bring their own styling along.
        onPaste={(e: React.ClipboardEvent<HTMLDivElement>) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

/** Floating formatting buttons. mousedown is cancelled so the text selection (and focus) stays in the editor. */
function FormatBar({ format }: { format: "basic" | "document" }) {
  const run = (cmd: string, value?: string) => document.execCommand(cmd, false, value);
  const btn = "grid size-8 place-items-center rounded-lg text-foreground hover:bg-muted";
  const B = ({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) => (
    <button type="button" aria-label={label} title={label} className={btn} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="absolute -top-12 left-0 z-30 flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <B label="Bold" onClick={() => run("bold")}>
        <Bold className="size-4" />
      </B>
      <B label="Italic" onClick={() => run("italic")}>
        <Italic className="size-4" />
      </B>
      {format === "document" && (
        <>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <B label="Heading" onClick={() => run("formatBlock", "h2")}>
            <Heading2 className="size-4" />
          </B>
          <B label="Sub-heading" onClick={() => run("formatBlock", "h3")}>
            <Heading3 className="size-4" />
          </B>
          <B label="Normal paragraph" onClick={() => run("formatBlock", "p")}>
            <Pilcrow className="size-4" />
          </B>
        </>
      )}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <B label="Bulleted list" onClick={() => run("insertUnorderedList")}>
        <List className="size-4" />
      </B>
      <B label="Numbered list" onClick={() => run("insertOrderedList")}>
        <ListOrdered className="size-4" />
      </B>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <B
        label="Add link"
        onClick={() => {
          const url = window.prompt("Link address (https://… or /page)");
          if (url && /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url.trim())) run("createLink", url.trim());
        }}
      >
        <Link2 className="size-4" />
      </B>
      <B label="Remove link" onClick={() => run("unlink")}>
        <Unlink className="size-4" />
      </B>
    </div>
  );
}

const isExternal = (href: string) => /^(https?:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");

/** Internal links navigate in-app; external links open in a new tab. In edit mode links are inert. */
export function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const ed = useEditor();
  if (ed.editing) {
    return (
      <span className={className} title={href || "No link set"}>
        {children}
      </span>
    );
  }
  if (!href) return <span className={className}>{children}</span>;
  if (isExternal(href)) {
    return (
      <a href={href} className={className} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  }
  return (
    <Link to={href as never} className={className}>
      {children}
    </Link>
  );
}

/**
 * Button whose label is `${k}Text` and destination is `${k}Link` in the current section.
 * "solid" is the blue pill with a round arrow; "ghost" is the outlined pill (like "To watchlist" in the design).
 */
export function Cta({
  k,
  variant = "solid",
  className,
}: {
  k: string;
  variant?: "solid" | "ghost" | "dark";
  className?: string;
}) {
  const { data } = useBlock();
  const text = str(data, `${k}Text`);
  const href = str(data, `${k}Link`);
  const ed = useEditor();
  if (!text && !ed.editing) return null;
  const base = "inline-flex items-center justify-center gap-3 rounded-full text-sm font-medium uppercase tracking-wide transition-all";
  const look =
    variant === "solid"
      ? "gold-surface py-2 pl-6 pr-2 hover:brightness-110"
      : variant === "dark"
        ? "bg-background px-8 py-3.5 text-foreground hover:bg-black"
        : "border border-border px-7 py-3.5 text-primary hover:border-primary";
  return (
    <SmartLink href={href} className={cn(base, look, className)}>
      <T k={`${k}Text`} />
      {variant === "solid" && (
        <span className="grid size-10 place-items-center rounded-full bg-black/15" aria-hidden="true">
          <ArrowRight className="size-4" />
        </span>
      )}
    </SmartLink>
  );
}

/* ───────────── media ───────────── */

/** Neutral cinematic stand-in used wherever no image has been chosen yet. */
export function Placeholder({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("ph-art flex items-end p-4", className)} role="img" aria-label={label ?? "Placeholder image"}>
      {label && <span className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-foreground/40">{label}</span>}
    </div>
  );
}

/** Picture from a stored path or URL; falls back to the placeholder. */
export function Img({
  src,
  alt,
  className,
  label,
  eager = false,
}: {
  src?: string | null | undefined;
  alt: string;
  className?: string;
  label?: string;
  eager?: boolean;
}) {
  const url = mediaUrl(src ?? null);
  if (!url) return <Placeholder {...(label ? { label } : {})} className={className ?? ""} />;
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      {...(eager ? { fetchPriority: "high" as const } : {})}
    />
  );
}

/** Section picture with a "Replace" button for editors. `k` is the field path in the current section. */
export function Pic({ k, alt, className, label }: { k: string; alt: string; className?: string; label?: string }) {
  const { id, data } = useBlock();
  const ed = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const src = str(data, k);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      const path = await uploadMedia(file, "blocks");
      ed.updateField(id, k, path);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    }
  }

  return (
    <div className={cn("relative size-full", ed.editing && "outline-dashed outline-1 outline-offset-2 outline-primary/70")}>
      <Img src={src} alt={alt} className={cn("size-full object-cover", className)} {...(label ? { label } : {})} />
      {ed.editing && (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="gold-surface absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold"
          >
            <ImagePlus className="size-4" /> Replace image
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

