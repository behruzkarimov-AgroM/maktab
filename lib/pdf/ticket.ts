import { FONT, downloadCanvasPdf, downloadCanvasPng, drawLogo, makeCanvas, roundRect, wrapText } from "./canvas";

export interface TicketData {
  ticket: string;
  name: string;
  olympiad: string;
  subject: string;
  grade: number;
  date: string;
  location: string;
  school: string;
}

export interface TicketLabels {
  schoolName: string;
  title: string;
  ticket: string;
  student: string;
  olympiad: string;
  subject: string;
  grade: string;
  date: string;
  location: string;
  school: string;
  scanHint: string;
  note: string;
}

/** A4 portrait @150dpi. `qr` is a canvas containing the QR code. */
export function drawTicket(data: TicketData, labels: TicketLabels, qr: HTMLCanvasElement): HTMLCanvasElement {
  const W = 1240;
  const H = 1754;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // header band
  const g = ctx.createLinearGradient(0, 0, W, 300);
  g.addColorStop(0, "#14253f");
  g.addColorStop(0.6, "#1d3557");
  g.addColorStop(1, "#457b9d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 300);
  ctx.fillStyle = "#f4b942";
  ctx.fillRect(0, 300, W, 12);
  drawLogo(ctx, W - 80 - 190, 55, 190);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(labels.schoolName.toUpperCase(), 80, 110);
  ctx.font = `800 80px ${FONT}`;
  ctx.fillText(labels.title, 80, 210);

  // card
  ctx.fillStyle = "#f2f6fb";
  roundRect(ctx, 60, 340, W - 120, H - 340 - 50, 36);
  ctx.fill();
  ctx.strokeStyle = "#a9bdd4";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.stroke();
  ctx.setLineDash([]);

  // ticket number
  ctx.fillStyle = "#335d7a";
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(labels.ticket.toUpperCase(), 110, 420);
  ctx.fillStyle = "#1d3557";
  ctx.font = `800 76px "Consolas", "Courier New", monospace`;
  ctx.fillText(data.ticket, 110, 505);

  const rows: [string, string][] = [
    [labels.student, data.name],
    [labels.olympiad, data.olympiad],
    [labels.subject, data.subject],
    [labels.grade, String(data.grade)],
    [labels.school, data.school],
    [labels.date, data.date],
    [labels.location, data.location],
  ];
  // compact rows: 7 single-line rows = 700px, so the QR always fits on the A4 canvas
  let y = 560;
  for (const [k, v] of rows) {
    ctx.fillStyle = "#3f7396";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(k.toUpperCase(), 110, y);
    ctx.fillStyle = "#111827";
    ctx.font = `600 36px ${FONT}`;
    const lines = wrapText(ctx, v, W - 260).slice(0, k === labels.olympiad ? 2 : 1);
    lines.forEach((ln, i) => ctx.fillText(ln, 110, y + 44 + i * 42));
    y += 44 + lines.length * 42 + 20;
  }

  // QR: sized to the space that is left (never drawn outside the canvas)
  const qy = y + 6;
  const qs = Math.max(200, Math.min(340, H - 210 - qy));
  const qx = (W - qs) / 2;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qx - 24, qy - 24, qs + 48, qs + 48, 24);
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qx, qy, qs, qs);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = "#4b5563";
  ctx.font = `500 26px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(labels.scanHint, W / 2, qy + qs + 50);
  ctx.textAlign = "left";

  // note
  ctx.fillStyle = "#6b7280";
  ctx.font = `400 24px ${FONT}`;
  wrapText(ctx, labels.note, W - 220)
    .slice(0, 2)
    .forEach((ln, i) => ctx.fillText(ln, 110, qy + qs + 96 + i * 32));
  return c;
}

export async function downloadTicketPdf(c: HTMLCanvasElement, ticket: string) {
  await downloadCanvasPdf(c, `ticket-${ticket}`, "portrait");
}
export function downloadTicketPng(c: HTMLCanvasElement, ticket: string) {
  downloadCanvasPng(c, `ticket-${ticket}`);
}
