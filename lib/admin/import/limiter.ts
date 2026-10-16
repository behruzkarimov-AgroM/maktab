// In-process concurrency limits for the CPU / memory heavy parts of the import (server only). Importing is rare and admin-only, but a
// handful of parallel 10 MB documents or OCR jobs can exhaust a small instance, so excess jobs are refused with a stable, retryable code.
import { ImportError } from "./errors";

const g = globalThis as unknown as { __importSlots?: { jobs: number; ocr: number } };
const slots = (g.__importSlots ??= { jobs: 0, ocr: 0 });

export const MAX_IMPORT_JOBS = 3;
export const MAX_OCR_JOBS = 1;

async function guarded<T>(key: "jobs" | "ocr", max: number, fn: () => Promise<T>): Promise<T> {
  if (slots[key] >= max) throw new ImportError("rate_limited", 429);
  slots[key]++;
  try {
    return await fn();
  } finally {
    slots[key]--;
  }
}

/** Whole import request (extraction + parsing + optional AI). */
export const withImportSlot = <T>(fn: () => Promise<T>) => guarded("jobs", MAX_IMPORT_JOBS, fn);
/** OCR (tesseract worker + canvas rendering): one at a time per process. */
export const withOcrSlot = <T>(fn: () => Promise<T>) => guarded("ocr", MAX_OCR_JOBS, fn);

/** test hook */
export const __activeSlots = () => ({ ...slots });
