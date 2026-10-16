import { GamesHub } from "@/components/games/GamesHub";
import { loadGames } from "@/components/games/load-config";

import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return pageMetadata(locale, "games", "/games");
}

export default async function GamesPage() {
  const games = await loadGames();
  return <GamesHub games={games} />;
}
