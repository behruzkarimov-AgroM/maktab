"use client";

import { useCallback, useSyncExternalStore } from "react";

// One subscription list for every key: a write notifies all readers in this tab, the "storage" event covers other tabs.
const listeners = new Set<() => void>();
// Writes are mirrored here so the UI still updates when localStorage throws (private mode, blocked site data).
const memory = new Map<string, string>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function read(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* ignore */
  }
  return memory.get(key) ?? null;
}

/**
 * A string persisted in localStorage, read without a mount effect (no setState-in-effect, no extra render).
 * The server snapshot is null, so markup rendered on the server always uses the caller's default; the stored value is applied during
 * hydration by React itself.
 */
export function useLocalStorage(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback(
    (v: string) => {
      memory.set(key, v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* ignore */
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
