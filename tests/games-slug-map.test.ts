import { describe, expect, it } from "vitest";
import { CONTENT_SLUG_TYPE as local } from "@/components/games/content-types";
import { CONTENT_SLUG_TYPE as canonical, CONTENT_GAME_SLUG } from "@/lib/admin/game-content-types";

describe("games content slug map", () => {
  it("client copy (kept zod-free for bundle size) equals the canonical admin map", () => {
    expect(local).toEqual(canonical);
  });
  it("is the inverse of CONTENT_GAME_SLUG", () => {
    for (const [type, slug] of Object.entries(CONTENT_GAME_SLUG)) expect(local[slug]).toBe(type);
  });
});
