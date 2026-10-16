import type { ImportErrorCode } from "./types";

/** Stable-coded error: the message IS the code, nothing raw ever reaches a client. `data` carries safe extras (e.g. the extracted text). */
export class ImportError extends Error {
  constructor(
    public code: ImportErrorCode,
    public status = 400,
    public data?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ImportError";
  }
}
