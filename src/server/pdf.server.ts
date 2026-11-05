/**
 * Minimal single-purpose PDF writer (no dependencies): text, lines and rectangles in the built-in
 * Helvetica fonts. Coordinates are in points with the origin at the TOP-left of an A4 page.
 */

// Helvetica advance widths (1/1000 em) for ASCII 32..126.
const W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

export type Align = "left" | "right" | "center";
export type Rgb = [number, number, number];

const A4 = { w: 595.28, h: 841.89 };

/** Keeps the text inside what the built-in font can show (Latin-1); anything else becomes "?". */
function clean(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}
const esc = (s: string) => clean(s).replace(/([\\()])/g, "\\$1");
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const rgb = (c: Rgb) => `${n(c[0])} ${n(c[1])} ${n(c[2])}`;

export class Pdf {
  readonly width = A4.w;
  readonly height = A4.h;
  private ops: string[] = [];

  textWidth(s: string, size: number, bold = false): number {
    const table = bold ? W_BOLD : W_REG;
    let total = 0;
    for (const ch of clean(s)) {
      const code = ch.charCodeAt(0);
      total += code >= 32 && code <= 126 ? (table[code - 32] ?? 556) : 556;
    }
    return (total * size) / 1000;
  }

  /** Splits text into lines no wider than maxWidth. */
  wrap(s: string, size: number, maxWidth: number, bold = false): string[] {
    const lines: string[] = [];
    for (const para of clean(s).split(/\s*\|\|\s*/)) {
      let line = "";
      for (const word of para.split(" ").filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && this.textWidth(next, size, bold) > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  /** y is the text baseline, measured from the top of the page. */
  text(x: number, y: number, s: string, o: { size?: number; bold?: boolean; align?: Align; color?: Rgb } = {}) {
    const size = o.size ?? 10;
    const w = this.textWidth(s, size, o.bold);
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops.push(`BT ${rgb(o.color ?? [0, 0, 0])} rg /${o.bold ? "F2" : "F1"} ${n(size)} Tf ${n(left)} ${n(A4.h - y)} Td (${esc(s)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, color: Rgb = [0.6, 0.6, 0.6]) {
    this.ops.push(`${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(A4.h - y1)} m ${n(x2)} ${n(A4.h - y2)} l S`);
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: Rgb; stroke?: Rgb; lineWidth?: number } = {}) {
    const parts: string[] = [];
    if (o.fill) parts.push(`${rgb(o.fill)} rg`);
    if (o.stroke) parts.push(`${rgb(o.stroke)} RG ${n(o.lineWidth ?? 0.5)} w`);
    parts.push(`${n(x)} ${n(A4.h - y - h)} ${n(w)} ${n(h)} re ${o.fill && o.stroke ? "B" : o.fill ? "f" : "S"}`);
    this.ops.push(parts.join(" "));
  }

  build(title: string): Buffer {
    const stream = this.ops.join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      `<< /Title (${esc(title)}) /Producer (D Mojo Art) >>`,
    ];
    let out = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // Every character is <= 0xFF, so latin1 keeps byte offsets equal to string offsets.
    return Buffer.from(out, "latin1");
  }
}
