/**
 * Canvas based document rendering helpers.
 * jsPDF's built-in fonts have no Cyrillic / Uzbek glyphs, so documents are drawn on a canvas
 * (browser fonts handle every script) and embedded into the PDF as an image.
 * Browser only.
 */

export const FONT = '"Segoe UI", "Helvetica Neue", Arial, "Noto Sans", sans-serif';

let logoImg: HTMLImageElement | null = null;
/** Starts loading the school logo (call early so it is ready when a document is drawn). */
export function preloadLogo(): void {
  if (typeof window === "undefined" || logoImg) return;
  logoImg = new Image();
  logoImg.src = "/logo.png";
}
preloadLogo();

/** Draws the school logo as a circle at (x, y) with the given diameter; skipped if it has not loaded yet. */
export function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  preloadLogo();
  if (!logoImg || !logoImg.complete || !logoImg.naturalWidth) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(logoImg, x, y, size, size);
  ctx.restore();
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function safeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "document";
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${safeFileName(filename)}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, "image/png");
}

export async function downloadCanvasPdf(
  canvas: HTMLCanvasElement,
  filename: string,
  orientation: "portrait" | "landscape",
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pw, ph, undefined, "FAST");
  const blob = pdf.output("blob");
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `${safeFileName(filename)}.pdf`);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return blob;
}
