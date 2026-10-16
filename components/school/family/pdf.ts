// Canvas -> PDF documents of the family cabinet (A4 portrait @150dpi), same pattern as lib/pdf/certificate.ts. Browser only.
import { FONT, downloadCanvasPdf, drawLogo, makeCanvas, wrapText } from "@/lib/pdf/canvas";

export interface PdfLabels {
  school: string; reportTitle: string; spravkaTitle: string; student: string; className: string; period: string; year: string; term: string; wholeYear: string;
  subject: string; teacher: string; average: string; termGrade: string; yearGrade: string; gpa: string; rank: string; attendance: string; present: string; absent: string;
  late: string; excused: string; sick: string; homeroom: string; generated: string; signature: string; spravkaText: string; spravkaNote: string; totalDays: string; stamp: string;
}
export interface ReportPdfData {
  studentName: string; className: string; yearName: string; termName: string | null; homeroom: string | null; generatedAt: string;
  rows: { subject: string; teacher: string; average: string; termGrade: string; yearGrade: string }[];
  gpa: string; rank: string; att: { pct: string; present: number; absent: number; late: number; excused: number; sick: number };
}
const W = 1240;
const H = 1754;

function header(ctx: CanvasRenderingContext2D, l: PdfLabels, title: string) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1d3557";
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.strokeStyle = "#f4b942";
  ctx.lineWidth = 3;
  ctx.strokeRect(46, 46, W - 92, H - 92);
  drawLogo(ctx, 90, 90, 120);
  ctx.textAlign = "left";
  ctx.fillStyle = "#457b9d";
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText(l.school.toUpperCase(), 240, 140);
  ctx.fillStyle = "#1d3557";
  ctx.font = `800 56px ${FONT}`;
  ctx.fillText(title, 240, 205);
}

export function drawReportCard(d: ReportPdfData, l: PdfLabels): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  header(ctx, l, l.reportTitle);
  ctx.fillStyle = "#111827";
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText(d.studentName, 90, 300);
  ctx.fillStyle = "#475569";
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(`${l.className}: ${d.className}    ${l.year}: ${d.yearName}    ${d.termName ?? l.wholeYear}`, 90, 345);
  if (d.homeroom) ctx.fillText(`${l.homeroom}: ${d.homeroom}`, 90, 385);

  // table
  const cols = [90, 520, 800, 930, 1060];
  let y = 440;
  ctx.fillStyle = "#1d3557";
  ctx.fillRect(90, y, W - 180, 54);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 24px ${FONT}`;
  [l.subject, l.teacher, l.average, l.termGrade, l.yearGrade].forEach((h, i) => ctx.fillText(h, cols[i] + 10, y + 36));
  y += 54;
  ctx.font = `500 26px ${FONT}`;
  d.rows.slice(0, 16).forEach((r, i) => {
    ctx.fillStyle = i % 2 ? "#f1f5f9" : "#ffffff";
    ctx.fillRect(90, y, W - 180, 48);
    ctx.fillStyle = "#111827";
    [r.subject, r.teacher, r.average, r.termGrade, r.yearGrade].forEach((v, k) => {
      let s = v;
      const max = (cols[k + 1] ?? W - 90) - cols[k] - 20;
      while (ctx.measureText(s).width > max && s.length > 3) s = s.slice(0, -2);
      if (s !== v) s += ".";
      ctx.fillText(s, cols[k] + 10, y + 33);
    });
    y += 48;
  });
  y += 50;
  const stat = (label: string, value: string, x: number) => {
    ctx.fillStyle = "#64748b";
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = "#1d3557";
    ctx.font = `800 48px ${FONT}`;
    ctx.fillText(value, x, y + 55);
  };
  stat(l.gpa, d.gpa, 90);
  stat(l.rank, d.rank, 420);
  stat(l.attendance, d.att.pct, 750);
  y += 120;
  ctx.fillStyle = "#334155";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(`${l.present}: ${d.att.present}   ${l.absent}: ${d.att.absent}   ${l.late}: ${d.att.late}   ${l.excused}: ${d.att.excused}   ${l.sick}: ${d.att.sick}`, 90, y);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `400 24px ${FONT}`;
  ctx.fillText(`${l.generated}: ${d.generatedAt}`, 90, H - 110);
  ctx.fillText(`${l.signature}: ____________________`, W - 520, H - 110);
  return c;
}

export interface SpravkaData {
  studentName: string; className: string; from: string; to: string; generatedAt: string;
  total: number; present: number; absent: number; late: number; excused: number; sick: number; pct: string;
}
export function drawSpravka(d: SpravkaData, l: PdfLabels): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  header(ctx, l, l.spravkaTitle);
  ctx.fillStyle = "#111827";
  ctx.font = `500 32px ${FONT}`;
  const text = l.spravkaText.replace("{name}", d.studentName).replace("{class}", d.className).replace("{from}", d.from).replace("{to}", d.to);
  wrapText(ctx, text, W - 180).forEach((ln, i) => ctx.fillText(ln, 90, 340 + i * 50));
  let y = 560;
  const rows: [string, string][] = [
    [l.totalDays, String(d.total)], [l.present, String(d.present)], [l.late, String(d.late)], [l.absent, String(d.absent)],
    [l.excused, String(d.excused)], [l.sick, String(d.sick)], [l.attendance, d.pct],
  ];
  rows.forEach(([k, v], i) => {
    ctx.fillStyle = i % 2 ? "#f1f5f9" : "#ffffff";
    ctx.fillRect(90, y, W - 180, 56);
    ctx.fillStyle = "#334155";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(k, 110, y + 38);
    ctx.fillStyle = "#1d3557";
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(v, W - 260, y + 38);
    y += 56;
  });
  ctx.fillStyle = "#64748b";
  ctx.font = `italic 400 24px ${FONT}`;
  wrapText(ctx, l.spravkaNote, W - 180).forEach((ln, i) => ctx.fillText(ln, 90, y + 60 + i * 34));
  ctx.fillStyle = "#94a3b8";
  ctx.font = `400 24px ${FONT}`;
  ctx.fillText(`${l.generated}: ${d.generatedAt}`, 90, H - 110);
  ctx.fillText(`${l.signature}: ____________________`, W - 520, H - 110);
  return c;
}

export const savePdf = (c: HTMLCanvasElement, name: string) => downloadCanvasPdf(c, name, "portrait");
