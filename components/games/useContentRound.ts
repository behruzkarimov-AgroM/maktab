"use client";
import { useEffect, useState } from "react";
import type { ContentRound } from "./content-types";

export type RoundState = { status: "loading" } | { status: "error" } | { status: "ready"; round: ContentRound };

/**
 * Loads one round (POST /api/games/content/round). The game component is mounted fresh for every run
 * (key = run), so this fetches exactly once per run; the request is aborted on unmount.
 */
export function useContentRound(setId: string, n: number): RoundState {
  const [state, setState] = useState<{ key: string; value: RoundState } | null>(null);
  const key = `${setId}|${n}`;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/games/content/round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ set_id: setId, n }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { round?: ContentRound }) => setState({ key, value: j.round ? { status: "ready", round: j.round } : { status: "error" } }))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setState({ key, value: { status: "error" } });
      });
    return () => ctrl.abort();
  }, [setId, n, key]);

  return state && state.key === key ? state.value : { status: "loading" };
}

export interface CheckResponse {
  correct: boolean;
  explanation: { uz: string; ru: string; en: string } | null;
  correct_option_id?: string;
}

/** POST /api/games/content/answer. Resolves null on any failure (network / already answered / invalid token). */
export async function postAnswer(token: string, itemId: string, answer: string): Promise<CheckResponse | null> {
  try {
    const r = await fetch("/api/games/content/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, item_id: itemId, answer }),
    });
    if (!r.ok) return null;
    return (await r.json()) as CheckResponse;
  } catch {
    return null;
  }
}

export async function postFifty(token: string, itemId: string): Promise<string[] | null> {
  try {
    const r = await fetch("/api/games/content/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, item_id: itemId, hint: "fifty" }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { remove?: string[] };
    return Array.isArray(j.remove) ? j.remove : null;
  } catch {
    return null;
  }
}
