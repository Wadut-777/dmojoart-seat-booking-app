import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, ImagePlus, Pencil, Plus, Send, Settings2, Trash2, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { BlockProvider } from "@/components/cms/context";
import { SECTION_COMPONENTS } from "@/components/cms/sections";
import { BLOCK_SPECS, BLOCK_SPEC_BY_TYPE, defaultBlockData, getPath, setPath, type BlockData, type BlockField } from "@/lib/cms-blocks";
import { addPageBlock, deletePageBlock, publishPage, reorderPageBlocks, updatePageBlock, type PageBlockRow } from "@/lib/content.functions";
import { mediaUrl, uploadMedia } from "@/lib/media";
import { cn } from "@/lib/utils";

export type EditableBlock = PageBlockRow;
const input = "w-full border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

const BG_OPTIONS = [
  { value: "", label: "Default (black)" },
  { value: "card", label: "Dark grey" },
  { value: "gold", label: "Gold" },
];
export const bgClass = (bg: unknown) => (bg === "card" ? "bg-card" : bg === "gold" ? "gold-surface" : "");

/** The section as visitors see it. Disabled sections render nothing unless the editor is showing them. */
export function RenderBlock({ block, showDisabled = false }: { block: EditableBlock; showDisabled?: boolean }) {
  const Section = SECTION_COMPONENTS[block.block_type];
  const enabled = block.data["enabled"] !== false;
  if (!Section || (!enabled && !showDisabled)) return null;
  return (
    <BlockProvider value={{ id: block.id, data: block.data }}>
      <div className={cn(bgClass(block.data["bg"]), !enabled && "opacity-40")}>
        <Section />
      </div>
    </BlockProvider>
  );
}

/* ───────────── form fields generated from the section registry ───────────── */

function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = mediaUrl(value);
  return (
    <div className="space-y-2">
      {url && <img src={url} alt="" className="h-24 w-full border border-border object-cover" />}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-2 border border-border px-3 py-2 text-xs font-bold hover:border-primary"
        >
          <ImagePlus className="size-4" /> {busy ? "Uploading…" : url ? "Replace" : "Upload"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")} className="border border-border px-3 py-2 text-xs font-bold hover:border-destructive">
            Remove
          </button>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…or paste an image URL"
        className={input}
        aria-label="Image URL"
      />
      <input
        ref={ref}
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
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: Exclude<BlockField, { kind: "list" }>; value: string; onChange: (v: string) => void }) {
  if (field.kind === "textarea") return <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} className={input} />;
  if (field.kind === "image") return <ImageField value={value} onChange={onChange} />;
  if (field.kind === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        {!field.options?.includes(value) && <option value={value}>{value || "—"}</option>}
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.kind === "number" ? "number" : field.kind === "url" ? "text" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={input}
    />
  );
}

function Fields({ fields, data, prefix, onSet }: { fields: BlockField[]; data: BlockData; prefix: string; onSet: (path: string, v: unknown) => void }) {
  return (
    <>
      {fields.map((field) => {
        const path = prefix + field.key;
        if (field.kind === "list") {
          const items = (getPath(data, path) as BlockData[] | undefined) ?? [];
          return (
            <fieldset key={path} className="space-y-3 border border-border p-3">
              <legend className="px-2 text-xs font-bold uppercase tracking-[0.2em]">{field.label}</legend>
              {items.map((_, i) => (
                <div key={i} className="space-y-3 border border-dashed border-border p-3">
                  <div className="flex items-center justify-between text-xs font-bold uppercase text-muted-foreground">
                    {field.itemLabel} {i + 1}
                    <button
                      type="button"
                      aria-label={`Remove ${field.itemLabel} ${i + 1}`}
                      onClick={() =>
                        onSet(
                          path,
                          items.filter((__, j) => j !== i),
                        )
                      }
                      className="hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <Fields fields={field.fields} data={data} prefix={`${path}.${i}.`} onSet={onSet} />
                </div>
              ))}
              <button
                type="button"
                onClick={() => onSet(path, [...items, Object.fromEntries(field.fields.map((x) => [x.key, ""]))])}
                className="inline-flex items-center gap-2 text-xs font-bold text-primary"
              >
                <Plus className="size-4" /> Add {field.itemLabel}
              </button>
            </fieldset>
          );
        }
        const raw = getPath(data, path);
        const value = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
        return (
          <label key={path} className="block space-y-1">
            <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">{field.label}</span>
            <FieldInput field={field} value={value} onChange={(v) => onSet(path, field.kind === "number" ? (v === "" ? "" : Number(v)) : v)} />
            {field.help && <span className="block text-xs text-muted-foreground">{field.help}</span>}
          </label>
        );
      })}
    </>
  );
}

function SettingsDrawer({
  block,
  onChange,
  onClose,
}: {
  block: EditableBlock;
  onChange: (id: string, data: BlockData) => void;
  onClose: () => void;
}) {
  const spec = BLOCK_SPEC_BY_TYPE[block.block_type];
  return (
    <aside className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl" aria-label="Section settings">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-lg uppercase">{spec?.label ?? block.block_type}</h2>
        <button type="button" aria-label="Close settings" onClick={onClose}>
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Fields fields={spec?.fields ?? []} data={block.data} prefix="" onSet={(path, v) => onChange(block.id, setPath(block.data, path, v))} />
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Section background</span>
          <select
            value={typeof block.data["bg"] === "string" ? (block.data["bg"] as string) : ""}
            onChange={(e) => onChange(block.id, setPath(block.data, "bg", e.target.value))}
            className={input}
          >
            {BG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}

/* ───────────── sortable wrapper around each section ───────────── */

function EditableSection({
  block,
  onSettings,
  onToggle,
  onDelete,
}: {
  block: EditableBlock;
  onSettings: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const enabled = block.data["enabled"] !== false;
  const label = BLOCK_SPEC_BY_TYPE[block.block_type]?.label ?? block.block_type;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/section relative outline-1 outline-dashed outline-transparent hover:outline-primary/60", isDragging && "z-50 opacity-70")}
    >
      <div className="absolute left-2 top-2 z-30 flex items-center gap-1 bg-background/95 p-1 text-xs shadow-lg">
        <button type="button" className="cursor-grab p-2 touch-none" aria-label={`Drag to move ${label}`} {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <span className="hidden px-1 font-bold uppercase tracking-[0.15em] sm:block">{label}</span>
        <button type="button" onClick={onSettings} className="p-2 hover:text-primary" aria-label={`Edit ${label} settings`}>
          <Settings2 className="size-4" />
        </button>
        <button type="button" onClick={onToggle} className="p-2 hover:text-primary" aria-label={enabled ? `Hide ${label}` : `Show ${label}`}>
          {enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
        <button type="button" onClick={onDelete} className="p-2 hover:text-destructive" aria-label={`Delete ${label}`}>
          <Trash2 className="size-4" />
        </button>
      </div>
      <RenderBlock block={block} showDisabled />
    </div>
  );
}

/* ───────────── the editor around a whole page ───────────── */

export function PageEditor({
  page,
  blocks,
  setBlocks,
  mode,
  setMode,
  children,
}: {
  page: string;
  blocks: EditableBlock[];
  setBlocks: (next: EditableBlock[]) => void;
  mode: "edit" | "preview";
  setMode: (m: "edit" | "preview") => void;
  children?: ReactNode;
}) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const open = blocks.find((b) => b.id === openId) ?? null;

  const fail = (what: string) => (e: unknown) => toast.error(`${what}: ${e instanceof Error ? e.message : "try again"}`);

  function change(id: string, data: BlockData) {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, data } : b)));
    void updatePageBlock({ data: { id, data } }).catch(fail("Could not save"));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(blocks, from, to).map((b, i) => ({ ...b, position: i }));
    setBlocks(next);
    void reorderPageBlocks({ data: { items: next.map((b) => ({ id: b.id, position: b.position })) } }).catch(fail("Could not reorder"));
  }

  async function add(type: string) {
    setAdding(false);
    try {
      await addPageBlock({ data: { page, block_type: type, position: blocks.length, data: defaultBlockData(type) } });
      await qc.invalidateQueries({ queryKey: ["cms-blocks", page] });
      toast.success("Section added at the bottom. Drag it where you want it.");
    } catch (e) {
      fail("Could not add section")(e);
    }
  }

  async function remove(b: EditableBlock) {
    const label = BLOCK_SPEC_BY_TYPE[b.block_type]?.label ?? b.block_type;
    if (!window.confirm(`Delete the "${label}" section? It disappears from the live page when you publish.`)) return;
    setBlocks(blocks.filter((x) => x.id !== b.id));
    void deletePageBlock({ data: { id: b.id } }).catch(fail("Could not delete"));
  }

  async function publish() {
    setBusy(true);
    try {
      await publishPage({ data: { page } });
      await qc.invalidateQueries({ queryKey: ["cms-blocks", page] });
      toast.success("Published. Visitors now see these changes.");
    } catch (e) {
      fail("Could not publish")(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-[80] flex flex-wrap items-center justify-center gap-2 border-t border-primary/50 bg-background/95 px-3 py-3 text-xs font-bold shadow-2xl backdrop-blur">
        <span className="hidden text-muted-foreground md:inline">
          {mode === "edit" ? "Editing draft — click text to edit, drag ⠿ to reorder" : "Preview — exactly as visitors will see it after publishing"}
        </span>
        <button
          type="button"
          onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          className="inline-flex items-center gap-2 border border-border px-4 py-2 hover:border-primary"
        >
          {mode === "edit" ? <Eye className="size-4" /> : <Pencil className="size-4" />} {mode === "edit" ? "Preview" : "Back to editing"}
        </button>
        {mode === "edit" && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 border border-border px-4 py-2 hover:border-primary">
            <Plus className="size-4" /> Add section
          </button>
        )}
        <button type="button" disabled={busy} onClick={publish} className="gold-surface inline-flex items-center gap-2 px-5 py-2 disabled:opacity-60">
          <Send className="size-4" /> {busy ? "Publishing…" : "Publish"}
        </button>
      </div>

      {mode === "edit" ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {blocks.map((b) => (
              <EditableSection
                key={b.id}
                block={b}
                onSettings={() => setOpenId(b.id)}
                onToggle={() => change(b.id, { ...b.data, enabled: b.data["enabled"] === false })}
                onDelete={() => void remove(b)}
              />
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        blocks.map((b) => <RenderBlock key={b.id} block={b} />)
      )}
      {children}

      {open && mode === "edit" && <SettingsDrawer block={open} onChange={change} onClose={() => setOpenId(null)} />}

      {adding && (
        <div role="dialog" aria-modal="true" aria-label="Add a section" className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4" onClick={() => setAdding(false)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto border border-border bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl uppercase">Add a section</h2>
              <button type="button" aria-label="Close" onClick={() => setAdding(false)}>
                <X className="size-5" />
              </button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {BLOCK_SPECS.map((s) => (
                <li key={s.type}>
                  <button type="button" onClick={() => void add(s.type)} className="w-full border border-border px-4 py-3 text-left text-sm font-semibold hover:border-primary">
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
