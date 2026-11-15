/**
 * Small, safe rich-text format used for page content (a Markdown subset).
 *
 *   ## Heading   ### Sub-heading   #### Small heading
 *   **bold**   *italic*   [link text](https://example.com)
 *   - bullet list    1. numbered list    --- divider
 *   A blank line starts a new paragraph; a single line break stays a line break.
 *
 * Plain text written before this existed renders exactly as before. Everything is escaped when turned
 * into HTML, and only http(s), mailto, tel, "/" and "#" links are kept, so stored text can never inject markup.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;
const ESCAPABLE = "\\*[]#-.()_>";

/** Inline formatting: escapes, **bold**, *italic*, [links](url) and line breaks. */
function inline(src: string, depth = 0): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "\\" && i + 1 < src.length && ESCAPABLE.includes(src[i + 1] as string)) {
      out += esc(src[i + 1] as string);
      i += 2;
    } else if (c === "\n") {
      out += "<br>";
      i += 1;
    } else if (depth < 4 && c === "*" && src[i + 1] === "*") {
      const end = findClose(src, "**", i + 2);
      if (end > i + 2) {
        out += `<strong>${inline(src.slice(i + 2, end), depth + 1)}</strong>`;
        i = end + 2;
      } else {
        out += "**";
        i += 2;
      }
    } else if (depth < 4 && c === "*") {
      const end = findClose(src, "*", i + 1);
      if (end > i + 1 && src[i + 1] !== " ") {
        out += `<em>${inline(src.slice(i + 1, end), depth + 1)}</em>`;
        i = end + 1;
      } else {
        out += "*";
        i += 1;
      }
    } else if (depth < 4 && c === "[") {
      const mid = findClose(src, "]", i + 1);
      if (mid > i && src[mid + 1] === "(") {
        const close = src.indexOf(")", mid + 2);
        if (close > mid) {
          const url = src.slice(mid + 2, close).trim();
          const label = inline(src.slice(i + 1, mid), depth + 1);
          if (SAFE_URL.test(url)) {
            const external = /^https?:\/\//i.test(url);
            out += `<a href="${esc(url)}"${external ? ' target="_blank" rel="noreferrer noopener"' : ""}>${label}</a>`;
          } else {
            out += label;
          }
          i = close + 1;
          continue;
        }
      }
      out += "[";
      i += 1;
    } else {
      out += esc(c);
      i += 1;
    }
  }
  return out;
}

/** Index of the next unescaped `token` at or after `from`, or -1. */
function findClose(src: string, token: string, from: number): number {
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === "\\") {
      i += 1;
      continue;
    }
    if (src.startsWith(token, i)) return i;
  }
  return -1;
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

/** Format text to safe HTML. Returns "" for empty input. */
export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let items: string[] = [];

  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join("\n"))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (listKind) html.push(`<${listKind}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${listKind}>`);
    listKind = null;
    items = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = HEADING.exec(line);
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    if (line.trim() === "") {
      flushPara();
      flushList();
    } else if (/^-{3,}$/.test(line.trim())) {
      flushPara();
      flushList();
      html.push("<hr>");
    } else if (h) {
      flushPara();
      flushList();
      // # and ## are both section headings; the page title is a separate field.
      const level = Math.min(4, Math.max(2, (h[1] as string).length));
      html.push(`<h${level}>${inline(h[2] as string)}</h${level}>`);
    } else if (b || n) {
      flushPara();
      const kind = b ? "ul" : "ol";
      if (listKind && listKind !== kind) flushList();
      listKind = kind;
      items.push(((b ?? n) as RegExpExecArray)[1] as string);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join("");
}

/* ───────────── HTML (from the on-page editor) back to text ───────────── */

/** The few DOM members the converter reads, so it can run on real DOM nodes and in tests. */
export type DomLike = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomLike>;
  getAttribute?: (name: string) => string | null;
};

const escText = (s: string) => s.replace(/[\\*[\]]/g, (m) => `\\${m}`);

function inlineMd(node: DomLike): string {
  if (node.nodeType === 3) return escText((node.textContent ?? "").replace(/ /g, " "));
  if (node.nodeType !== 1) return "";
  const tag = node.nodeName.toLowerCase();
  const inner = () => Array.from(node.childNodes, inlineMd).join("");
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") {
    const t = inner();
    return t.trim() ? `**${t}**` : t;
  }
  if (tag === "em" || tag === "i") {
    const t = inner();
    return t.trim() ? `*${t}*` : t;
  }
  if (tag === "a") {
    const href = node.getAttribute?.("href") ?? "";
    const t = inner();
    return SAFE_URL.test(href) && t.trim() ? `[${t}](${href})` : t;
  }
  return inner();
}

/** Escapes a line that would otherwise be read as a heading, bullet or number. */
const guardLineStart = (s: string) => s.replace(/^(#{1,4}\s|[-*]\s|\d+[.)]\s|-{3,}$)/, (m) => `\\${m}`);

/** Converts the editor's HTML (a root element) to the stored text format. */
export function htmlToMd(root: DomLike): string {
  const blocks: string[] = [];
  let loose = "";
  const flushLoose = () => {
    const t = loose.replace(/\n{3,}/g, "\n\n").trim();
    if (t) blocks.push(...t.split(/\n{2,}/).map(guardLineStart));
    loose = "";
  };

  for (const node of Array.from(root.childNodes)) {
    const tag = node.nodeType === 1 ? node.nodeName.toLowerCase() : "#text";
    if (/^h[1-6]$/.test(tag)) {
      flushLoose();
      const level = Number(tag[1]) <= 2 ? 2 : Number(tag[1]) === 3 ? 3 : 4;
      const t = Array.from(node.childNodes, inlineMd).join("").replace(/\n+/g, " ").trim();
      if (t) blocks.push(`${"#".repeat(level)} ${t}`);
    } else if (tag === "ul" || tag === "ol") {
      flushLoose();
      const rows: string[] = [];
      Array.from(node.childNodes).forEach((li) => {
        if (li.nodeType !== 1 || li.nodeName.toLowerCase() !== "li") return;
        const t = Array.from(li.childNodes, inlineMd).join("").replace(/\n+/g, " ").trim();
        if (t) rows.push(tag === "ul" ? `- ${t}` : `${rows.length + 1}. ${t}`);
      });
      if (rows.length) blocks.push(rows.join("\n"));
    } else if (tag === "hr") {
      flushLoose();
      blocks.push("---");
    } else if (tag === "p" || tag === "div" || tag === "blockquote") {
      flushLoose();
      const t = Array.from(node.childNodes, inlineMd).join("").replace(/\n{2,}/g, "\n").trim();
      if (t) blocks.push(guardLineStart(t));
    } else {
      loose += inlineMd(node);
    }
  }
  flushLoose();
  return blocks.join("\n\n");
}
