import { FONT, downloadCanvasPdf, downloadCanvasPng, drawLogo, makeCanvas, star, wrapText } from "./canvas";

export interface CertificateData {
  studentName: string;
  quizTitle: string;
  subject: string;
  grade: number;
  scorePercent: number;
  correct: number;
  total: number;
  passed: boolean;
  stars: number; // 0..3
  date: string;
  timeSpent: string;
}

export interface CertificateLabels {
  schoolName: string;
  certificateTitle: string; // shown when passed
  resultTitle: string; // shown when not passed
  awardedTo: string;
  forQuiz: string;
  score: string;
  correct: string;
  grade: string;
  time: string;
  date: string;
  passed: string;
  failed: string;
  footer: string;
}

/** A4 landscape @150dpi. */
export function drawCertificate(d: CertificateData, l: CertificateLabels): HTMLCanvasElement {
  const W = 1754;
  const H = 1240;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fffcf4";
  ctx.fillRect(0, 0, W, H);

  const accent = d.passed ? "#1d3557" : "#475569";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 12;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = d.passed ? "#f4b942" : accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(70, 70, W - 140, H - 140);

  drawLogo(ctx, 110, 100, 150);
  ctx.textAlign = "center";
  ctx.fillStyle = "#457b9d";
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(l.schoolName.toUpperCase(), W / 2, 190);

  ctx.fillStyle = accent;
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(d.passed ? l.certificateTitle : l.resultTitle, W / 2, 320);

  // stars
  for (let i = 0; i < 3; i++) {
    star(ctx, W / 2 + (i - 1) * 110, 420, 46);
    ctx.fillStyle = i < d.stars ? "#f4b942" : "#e5e7eb";
    ctx.fill();
  }

  ctx.fillStyle = "#6b7280";
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(l.awardedTo, W / 2, 530);
  ctx.fillStyle = "#111827";
  // shrink the name until it fits the frame; very long names wrap on two lines
  let size = 82;
  ctx.font = `800 ${size}px ${FONT}`;
  while (size > 44 && ctx.measureText(d.studentName).width > W - 300) {
    size -= 4;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  const nameLines = wrapText(ctx, d.studentName, W - 300).slice(0, 2);
  if (nameLines.length > 1) ctx.font = `800 ${Math.min(size, 56)}px ${FONT}`;
  nameLines.forEach((ln, i) => ctx.fillText(ln, W / 2, 625 - (nameLines.length - 1) * 28 + i * 60));

  ctx.fillStyle = "#6b7280";
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(l.forQuiz, W / 2, 700);
  ctx.fillStyle = "#1f2937";
  ctx.font = `700 50px ${FONT}`;
  wrapText(ctx, `${d.quizTitle} - ${d.subject}`, W - 360)
    .slice(0, 2)
    .forEach((ln, i) => ctx.fillText(ln, W / 2, 770 + i * 58));

  // stats
  const stats: [string, string][] = [
    [l.score, `${d.scorePercent}%`],
    [l.correct, `${d.correct}/${d.total}`],
    [l.grade, String(d.grade)],
    [l.time, d.timeSpent],
  ];
  const gap = 360;
  const sx = W / 2 - ((stats.length - 1) * gap) / 2;
  stats.forEach(([k, v], i) => {
    ctx.fillStyle = "#6b7280";
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(k.toUpperCase(), sx + i * gap, 930);
    ctx.fillStyle = d.passed ? "#15803d" : "#b91c1c";
    if (i > 0) ctx.fillStyle = "#111827";
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(v, sx + i * gap, 990);
  });

  ctx.fillStyle = d.passed ? "#15803d" : "#b91c1c";
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText((d.passed ? l.passed : l.failed).toUpperCase(), W / 2, 1075);

  ctx.fillStyle = "#6b7280";
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText(`${l.date}: ${d.date}  |  ${l.footer}`, W / 2, 1145);
  ctx.textAlign = "left";
  return c;
}

/** Downloads the PDF and returns its bytes (e.g. to archive server-side). */
export async function downloadCertificatePdf(c: HTMLCanvasElement, name: string): Promise<Blob> {
  return downloadCanvasPdf(c, `certificate-${name}`, "landscape");
}
export function downloadCertificatePng(c: HTMLCanvasElement, name: string) {
  downloadCanvasPng(c, `certificate-${name}`);
}
