import { Link } from "@tanstack/react-router";
import { ImagePlus } from "lucide-react";
import { createContext, useContext, useRef, type ElementType, type ReactNode } from "react";
import { toast } from "sonner";

import { str, type BlockData } from "@/lib/cms-blocks";
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
}: {
  k: string;
  as?: ElementType;
  className?: string;
  multiline?: boolean;
}) {
  const { id, data } = useBlock();
  const ed = useEditor();
  const Tag = as;
  const value = str(data, k);

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

/** Button whose label is `${k}Text` and destination is `${k}Link` in the current section. */
export function Cta({ k, variant = "solid", className }: { k: string; variant?: "solid" | "ghost"; className?: string }) {
  const { data } = useBlock();
  const text = str(data, `${k}Text`);
  const href = str(data, `${k}Link`);
  const ed = useEditor();
  if (!text && !ed.editing) return null;
  return (
    <SmartLink
      href={href}
      className={cn(
        "inline-flex items-center justify-center px-7 py-3 text-sm font-bold uppercase tracking-[0.15em] transition-all",
        variant === "solid"
          ? "gold-surface hover:brightness-110"
          : "border border-foreground/40 text-foreground hover:border-primary hover:text-primary",
        className,
      )}
    >
      <T k={`${k}Text`} />
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
            className="gold-surface absolute right-3 top-3 z-20 inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"
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

