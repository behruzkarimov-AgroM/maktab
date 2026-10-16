// Report card rendering: printable HTML (new window) and canvas -> jsPDF (Cyrillic / Uzbek safe, see lib/pdf/canvas.ts). Browser only.
import { drawLogo, FONT, makeCanvas, safeFileName, wrapText } from "@/lib/pdf/canvas";
import type { ReportCard } from "@/lib/school/types";
import { escapeHtml } from "./common";

export interface ReportLabels {
  title: string; student: string; cls: string; code: string; year: string; term: string; wholeYear: string; subject: string; teacher: string; average: string;
  termGrade: string; yearGrade: string; gpa: string; rank: string; attendance: string; present: string; absent: string; late: string; excused: string; sick: string;
  homeroom: string; school: string; date: string; signHomeroom: string; signDirector: string; signParent: string;
}
export type ReportCardL = ReportCard & { subjectNames: string[] };
const g = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "-" : v.toFixed(d));
const gradeCls = (v: number | null) => (v === null ? "" : `g${Math.round(v)}`);
const fullName = (s: ReportCard["student"]) => `${s.last_name} ${s.first_name}${s.middle_name ? ` ${s.middle_name}` : ""}`;

export function reportCardHtml(r: ReportCardL, L: ReportLabels): string {
  const termMode = !!r.term;
  const rows = r.subjects.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(r.subjectNames[i])}</td><td>${escapeHtml(s.teacher ?? "")}</td><td class="c">${g(s.average)}</td><td class="c ${gradeCls(termMode ? s.term_grade : s.year_grade)}"><b>${termMode ? (s.term_grade ?? "-") : (s.year_grade ?? "-")}</b></td></tr>`).join("");
  const a = r.attendance;
  return `<div class="page">
<div class="hdr"><div><h1>${escapeHtml(L.title)}</h1><div class="muted">${escapeHtml(L.school)}</div></div><div class="muted">${escapeHtml(L.year)}: ${escapeHtml(r.year.name)} · ${escapeHtml(r.term?.name ?? L.wholeYear)}</div></div>
<table><tr><th>${escapeHtml(L.student)}</th><td><b>${escapeHtml(fullName(r.student))}</b></td><th>${escapeHtml(L.cls)}</th><td>${escapeHtml(r.student.class_name ?? "")}</td><th>${escapeHtml(L.code)}</th><td>${escapeHtml(r.student.student_code)}</td></tr></table>
<table><thead><tr><th>#</th><th>${escapeHtml(L.subject)}</th><th>${escapeHtml(L.teacher)}</th><th class="c">${escapeHtml(L.average)}</th><th class="c">${escapeHtml(termMode ? L.termGrade : L.yearGrade)}</th></tr></thead><tbody>${rows}</tbody></table>
<table><tr><th>${escapeHtml(L.gpa)}</th><td>${g(r.gpa)}</td><th>${escapeHtml(L.rank)}</th><td>${r.rank_in_class ?? "-"} / ${r.class_size}</td><th>${escapeHtml(L.attendance)}</th><td>${a.percent === null ? "-" : `${a.percent}%`}</td></tr>
<tr><th>${escapeHtml(L.present)}</th><td>${a.present}</td><th>${escapeHtml(L.absent)}</th><td>${a.absent}</td><th>${escapeHtml(L.late)} / ${escapeHtml(L.excused)} / ${escapeHtml(L.sick)}</th><td>${a.late} / ${a.excused} / ${a.sick}</td></tr></table>
<p class="muted">${escapeHtml(L.homeroom)}: ${escapeHtml(r.homeroom_teacher ?? "-")} · ${escapeHtml(L.date)}: ${escapeHtml(r.generated_at.slice(0, 10))}</p>
<div class="sig"><div>${escapeHtml(L.signHomeroom)}</div><div>${escapeHtml(L.signDirector)}</div><div>${escapeHtml(L.signParent)}</div></div></div>`;
}

const W = 1240;
const H = 1754;
/** draws one report card on an A4 canvas (150 dpi) */
export function drawReportCard(r: ReportCardL, L: ReportLabels): HTMLCanvasElement {
  const cv = makeCanvas(W, H);
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  drawLogo(ctx, 70, 60, 90);
  ctx.fillStyle = "#1d3557";
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillText(L.title, 180, 105);
  ctx.fillStyle = "#64748b";
  ctx.font = `24px ${FONT}`;
  ctx.fillText(L.school, 180, 140);
  ctx.textAlign = "right";
  ctx.fillText(`${L.year}: ${r.year.name} · ${r.term?.name ?? L.wholeYear}`, W - 70, 105);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f4b942";
  ctx.fillRect(70, 170, W - 140, 5);

  ctx.fillStyle = "#0f172a";
  ctx.font = `bold 30px ${FONT}`;
  wrapText(ctx, fullName(r.student), W - 140).forEach((ln, i) => ctx.fillText(ln, 70, 230 + i * 36));
  ctx.font = `24px ${FONT}`;
  ctx.fillStyle = "#475569";
  ctx.fillText(`${L.cls}: ${r.student.class_name ?? "-"}    ${L.code}: ${r.student.student_code}`, 70, 275);

  const termMode = !!r.term;
  const cols = [70, 130, 560, 880, 1020];
  let y = 330;
  ctx.fillStyle = "#eef2f7";
  ctx.fillRect(70, y - 34, W - 140, 46);
  ctx.fillStyle = "#334155";
  ctx.font = `bold 21px ${FONT}`;
  [["#", 0], [L.subject, 1], [L.teacher, 2], [L.average, 3], [termMode ? L.termGrade : L.yearGrade, 4]].forEach(([txt, i]) => ctx.fillText(String(txt), cols[i as number] + 8, y));
  y += 52;
  ctx.font = `23px ${FONT}`;
  r.subjects.forEach((s, i) => {
    const grade = termMode ? s.term_grade : s.year_grade;
    ctx.fillStyle = grade === null ? "#fff" : grade >= 5 ? "#d1fae5" : grade >= 4 ? "#dbeafe" : grade >= 3 ? "#fef3c7" : "#fee2e2";
    ctx.fillRect(cols[4], y - 30, 150, 44);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(String(i + 1), cols[0] + 8, y);
    ctx.fillText(r.subjectNames[i].slice(0, 28), cols[1] + 8, y);
    ctx.fillStyle = "#475569";
    ctx.fillText((s.teacher ?? "").slice(0, 22), cols[2] + 8, y);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(g(s.average), cols[3] + 8, y);
    ctx.font = `bold 25px ${FONT}`;
    ctx.fillText(String(grade ?? "-"), cols[4] + 12, y);
    ctx.font = `23px ${FONT}`;
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(70, y + 14);
    ctx.lineTo(W - 70, y + 14);
    ctx.stroke();
    y += 50;
  });
  y += 20;
  const a = r.attendance;
  ctx.fillStyle = "#0f172a";
  ctx.font = `bold 25px ${FONT}`;
  ctx.fillText(`${L.gpa}: ${g(r.gpa)}     ${L.rank}: ${r.rank_in_class ?? "-"} / ${r.class_size}     ${L.attendance}: ${a.percent === null ? "-" : `${a.percent}%`}`, 70, y);
  y += 42;
  ctx.font = `22px ${FONT}`;
  ctx.fillStyle = "#475569";
  ctx.fillText(`${L.present}: ${a.present}   ${L.absent}: ${a.absent}   ${L.late}: ${a.late}   ${L.excused}: ${a.excused}   ${L.sick}: ${a.sick}`, 70, y);
  y += 40;
  ctx.fillText(`${L.homeroom}: ${r.homeroom_teacher ?? "-"}    ${L.date}: ${r.generated_at.slice(0, 10)}`, 70, y);
  const sy = H - 160;
  ctx.strokeStyle = "#64748b";
  [L.signHomeroom, L.signDirector, L.signParent].forEach((txt, i) => {
    const x = 70 + i * 370;
    ctx.beginPath();
    ctx.moveTo(x, sy);
    ctx.lineTo(x + 320, sy);
    ctx.stroke();
    ctx.font = `20px ${FONT}`;
    ctx.fillText(txt, x, sy + 28);
  });
  return cv;
}

/** one PDF with a page per report card */
export async function downloadReportPdf(reports: ReportCardL[], L: ReportLabels, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  reports.forEach((r, i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(drawReportCard(r, L).toDataURL("image/png"), "PNG", 0, 0, pw, ph, undefined, "FAST");
  });
  pdf.save(`${safeFileName(filename)}.pdf`);
}
