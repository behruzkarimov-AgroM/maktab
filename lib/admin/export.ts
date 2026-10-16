// Client-side CSV / XLSX export helpers.
import { toCsv } from "./validation";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Cell = string | number | null | undefined;

export function exportCsv(filename: string, header: string[], rows: Cell[][]) {
  download(new Blob([toCsv([header, ...rows])], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

export async function exportXlsx(filename: string, header: string[], rows: Cell[][], sheet = "Sheet1") {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = header.map((h, i) => ({ wch: Math.min(40, Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
