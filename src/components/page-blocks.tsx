import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Columns3, Rows3, GripVertical, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  addPageBlock,
  deletePageBlock,
  listPageBlocks,
  publishPage as publishPageFn,
  reorderPageBlocks,
  updatePageBlock,
} from "@/lib/content.functions";
import { mediaUrl, uploadMedia } from "@/lib/media";
import { canEditPages, useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";

type BlockData = {
  path?: string | undefined;
  text?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  paths?: string[];
  buttonText?: string;
  buttonLink?: string;
  url?: string;
  children?: Block[];
};
type Block = { id: string; page: string; position: number; block_type: string; data: BlockData };

const BLOCK_TYPES = [
  { value: "heading", label: "Heading" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "banner", label: "Banner" },
  { value: "gallery", label: "Gallery" },
  { value: "button", label: "Button" },
  { value: "video", label: "YouTube video" },
  { value: "row", label: "Row" },
  { value: "column", label: "Column" },
] as const;

const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";

function BlockImage({ path, alt, className }: { path?: string | undefined; alt: string; className?: string }) {
  const url = mediaUrl(path);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

function youtubeEmbed(url?: string) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

function BlockView({ block }: { block: Block }) {
  const d = block.data;
  switch (block.block_type) {
    case "heading":
      return <h2 className="text-3xl md:text-5xl">{d.text}</h2>;
    case "text":
      return <p className="whitespace-pre-line text-lg text-muted-foreground">{d.text}</p>;
    case "row":
      return (
        <div className="flex flex-col gap-6 md:flex-row">
          {(d.children ?? []).map((child) => (
            <div key={child.id} className="min-w-0 flex-1 break-words"><BlockView block={child} /></div>
          ))}
        </div>
      );
    case "column":
      return <div className="min-w-0 space-y-6 break-words">{(d.children ?? []).map((child) => <BlockView key={child.id} block={child} />)}</div>;
    case "image":
      return (
        <figure>
          <BlockImage path={d.path} alt={d.caption ?? ""} className="w-full rounded-xl object-cover" />
          {d.caption && <figcaption className="mt-2 text-sm text-muted-foreground">{d.caption}</figcaption>}
        </figure>
      );
    case "banner":
      return (
        <div className="relative overflow-hidden rounded-2xl">
          <BlockImage path={d.path} alt={d.title ?? ""} className="h-72 w-full object-cover md:h-96" />
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-background via-background/40 to-transparent p-8">
            {d.title && <h2 className="text-3xl md:text-5xl">{d.title}</h2>}
            {d.subtitle && <p className="mt-2 max-w-2xl text-muted-foreground">{d.subtitle}</p>}
            {d.buttonText && d.buttonLink && (
              <a href={d.buttonLink} className="gold-surface mt-4 w-fit rounded-full px-6 py-2 font-bold">
                {d.buttonText}
              </a>
            )}
          </div>
        </div>
      );
    case "gallery":
      return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {(d.paths ?? []).map((p) => (
            <BlockImage key={p} path={p} alt="" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      );
    case "button":
      return d.buttonText ? (
        <a href={d.buttonLink || "#"} className="gold-surface inline-block rounded-full px-6 py-3 font-bold">
          {d.buttonText}
        </a>
      ) : null;
    case "video": {
      const src = youtubeEmbed(d.url);
      return src ? (
        <div className="aspect-video overflow-hidden rounded-xl">
          <iframe src={src} title="Video" className="h-full w-full" allowFullScreen />
        </div>
      ) : null;
    }
    default:
      return null;
  }
}

async function uploadImage(file: File) {
  try {
    return await uploadMedia(file, "blocks");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Image upload failed.");
    return null;
  }
}

function makeBlock(type: string, page: string, position = 0): Block {
  const block: Block = { id: crypto.randomUUID(), page, position, block_type: type, data: {} };
  if (type === "row") block.data.children = [makeBlock("column", page), makeBlock("column", page, 1)];
  return block;
}

function LayoutEditor({ block, children, onChange }: { block: Block; children: Block[]; onChange: (children: Block[]) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function reorder({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = children.findIndex((child) => child.id === active.id);
    const to = children.findIndex((child) => child.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(children, from, to).map((child, position) => ({ ...child, position })));
  }
  const types = block.block_type === "row" ? BLOCK_TYPES.filter((type) => type.value === "column") : BLOCK_TYPES.filter((type) => type.value !== "column");
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2">
        {types.map((type) => <Button key={type.value} type="button" variant="outline" size="sm" onClick={() => onChange([...children, makeBlock(type.value, block.page, children.length)])}><Plus />{type.label}</Button>)}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={children.map((child) => child.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {children.map((child) => <SortableBlock key={child.id} block={child} onDelete={() => onChange(children.filter((item) => item.id !== child.id))} onSave={(data) => onChange(children.map((item) => item.id === child.id ? { ...item, data } : item))} />)}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function BlockEditor({ block, onDone, onSave }: { block: Block; onDone: () => void; onSave?: ((data: BlockData) => void) | undefined }) {
  const qc = useQueryClient();
  const [d, setD] = useState<BlockData>(block.data);
  const [busy, setBusy] = useState(false);
  const t = block.block_type;
  const set = (k: keyof BlockData, v: string) => setD((x) => ({ ...x, [k]: v }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>, multi = false) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    const paths = (await Promise.all(files.map(uploadImage))).filter(Boolean) as string[];
    setBusy(false);
    if (multi) setD((x) => ({ ...x, paths: [...(x.paths ?? []), ...paths] }));
    else if (paths[0]) setD((x) => ({ ...x, path: paths[0] }));
  }

  async function save() {
    if (onSave) {
      onSave(d);
      onDone();
      return;
    }
    try {
      await updatePageBlock({ data: { id: block.id, data: d as Record<string, unknown> } });
    } catch {
      toast.error("Could not save block.");
      return;
    }
    toast.success("Block saved.");
    qc.invalidateQueries({ queryKey: ["page-blocks", block.page, "draft"] });
    onDone();
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/50 bg-card p-4">
      {(t === "row" || t === "column") && <LayoutEditor block={block} children={d.children ?? []} onChange={(children) => setD((current) => ({ ...current, children }))} />}
      {(t === "heading" || t === "text") && (
        <textarea rows={t === "text" ? 5 : 2} className={input} value={d.text ?? ""} onChange={(e) => set("text", e.target.value)} placeholder="Text" />
      )}
      {(t === "image" || t === "banner") && (
        <>
          <BlockImage path={d.path} alt="" className="h-32 rounded-lg object-cover" />
          <input type="file" accept="image/*" onChange={(e) => onFile(e)} className="text-sm" />
        </>
      )}
      {t === "image" && <input className={input} value={d.caption ?? ""} onChange={(e) => set("caption", e.target.value)} placeholder="Caption (optional)" />}
      {t === "banner" && (
        <>
          <input className={input} value={d.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Title" />
          <input className={input} value={d.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="Subtitle" />
        </>
      )}
      {(t === "banner" || t === "button") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} value={d.buttonText ?? ""} onChange={(e) => set("buttonText", e.target.value)} placeholder="Button text" />
          <input className={input} value={d.buttonLink ?? ""} onChange={(e) => set("buttonLink", e.target.value)} placeholder="Button link, e.g. /prebook" />
        </div>
      )}
      {t === "gallery" && (
        <>
          <div className="flex flex-wrap gap-2">
            {(d.paths ?? []).map((p) => (
              <div key={p} className="relative">
                <BlockImage path={p} alt="" className="size-20 rounded object-cover" />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setD((x) => ({ ...x, paths: (x.paths ?? []).filter((q) => q !== p) }))}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <input type="file" accept="image/*" multiple onChange={(e) => onFile(e, true)} className="text-sm" />
        </>
      )}
      {t === "video" && <input className={input} value={d.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="YouTube link" />}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          {busy ? "Uploading…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SortableBlock({ block, onDelete, onSave }: { block: Block; onDelete: () => void; onSave?: (data: BlockData) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const [editing, setEditing] = useState(false);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative rounded-2xl border border-dashed border-primary/40 p-4 ${isDragging ? "z-10 opacity-70" : ""}`}
    >
      <div className="mb-3 flex items-center gap-2 text-xs font-bold text-primary">
        <button type="button" aria-label="Drag to reorder" className="cursor-grab touch-none rounded p-1 hover:bg-muted" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <span className="uppercase tracking-widest">{BLOCK_TYPES.find((b) => b.value === block.block_type)?.label}</span>
        <span className="ml-auto flex gap-1">
          <button type="button" aria-label="Edit block" onClick={() => setEditing((v) => !v)} className="rounded p-1 hover:bg-muted">
            <Pencil className="size-4" />
          </button>
          <button type="button" aria-label="Delete block" onClick={onDelete} className="rounded p-1 text-destructive hover:bg-muted">
            <Trash2 className="size-4" />
          </button>
        </span>
      </div>
      {editing ? <BlockEditor block={block} onDone={() => setEditing(false)} onSave={onSave} /> : <BlockView block={block} />}
    </div>
  );
}

/** Extra content sections for a page. Admins and editors can add, edit, delete and drag to reorder. */
export function PageBlocks({ page }: { page: string }) {
  const qc = useQueryClient();
  const canEdit = canEditPages(useRoles());
  const [editMode, setEditMode] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const blocks = useQuery({
    queryKey: ["page-blocks", page, canEdit ? "draft" : "published"],
    queryFn: async () => (await listPageBlocks({ data: { page, draft: canEdit } })) as Block[],
  });
  const list = blocks.data ?? [];

  async function addBlock(type: string) {
    const position = list.length ? Math.max(...list.map((b) => b.position)) + 1 : 0;
    try {
      await addPageBlock({
        data: { page, block_type: type, position, data: makeBlock(type, page, position).data as Record<string, unknown> },
      });
    } catch {
      toast.error("Could not add block.");
      return;
    }
    toast.success("Draft block added — click the pencil to fill it in.");
    qc.invalidateQueries({ queryKey: ["page-blocks", page, "draft"] });
  }

  async function deleteBlock(id: string) {
    if (!window.confirm("Delete this block?")) return;
    try {
      await deletePageBlock({ data: { id } });
    } catch {
      toast.error("Could not delete block.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["page-blocks", page, "draft"] });
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = list.findIndex((b) => b.id === active.id);
    const to = list.findIndex((b) => b.id === over.id);
    const next = arrayMove(list, from, to).map((b, i) => ({ ...b, position: i }));
    qc.setQueryData(["page-blocks", page, "draft"], next);
    try {
      await reorderPageBlocks({ data: { items: next.map((b) => ({ id: b.id, position: b.position })) } });
    } catch {
      toast.error("Could not save the new order.");
    }
    qc.invalidateQueries({ queryKey: ["page-blocks", page, "draft"] });
  }

  async function publishPage() {
    try {
      await publishPageFn({ data: { page } });
    } catch {
      toast.error("Could not publish this page.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["page-blocks", page] });
    toast.success("Page published — your changes are now visible.");
  }

  if (!canEdit && !list.length) return null;

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-5 py-12">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-card p-3 text-sm">
          <span className="font-bold text-primary">Page builder</span>
          <button type="button" onClick={() => setEditMode((v) => !v)} className="rounded-full border border-border px-4 py-1 text-xs font-bold hover:bg-muted">
            {editMode ? "Done editing" : "Edit blocks"}
          </button>
          {editMode &&
            BLOCK_TYPES.map((b) => (
              <Button key={b.value} type="button" variant="outline" size="sm" onClick={() => addBlock(b.value)}>
                {b.value === "row" ? <Rows3 /> : b.value === "column" ? <Columns3 /> : <Plus />} {b.label}
              </Button>
            ))}
          {editMode && <Button type="button" size="sm" onClick={publishPage}><Send /> Publish</Button>}
        </div>
      )}
      {editMode && canEdit ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {list.map((b) => (
                <SortableBlock key={b.id} block={b} onDelete={() => deleteBlock(b.id)} />
              ))}
              {!list.length && <p className="text-muted-foreground">No blocks yet. Add one above.</p>}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        list.map((b) => <BlockView key={b.id} block={b} />)
      )}
    </section>
  );
}
