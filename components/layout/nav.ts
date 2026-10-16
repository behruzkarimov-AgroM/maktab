export type NavKey =
  | "home"
  | "about"
  | "programs"
  | "campus"
  | "team"
  | "achievements"
  | "olympiads"
  | "quizzes"
  | "psychology"
  | "surveys"
  | "games"
  | "assessment"
  | "contact";

export type NavItem = { key: NavKey; href: string };

/** Every public section (CONTRACT order). */
export const NAV_ITEMS: NavItem[] = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "programs", href: "/programs" },
  { key: "campus", href: "/campus" },
  { key: "team", href: "/team" },
  { key: "achievements", href: "/achievements" },
  { key: "olympiads", href: "/olympiads" },
  { key: "quizzes", href: "/quizzes" },
  { key: "psychology", href: "/psychology" },
  { key: "surveys", href: "/surveys" },
  { key: "games", href: "/games" },
  { key: "assessment", href: "/assessment" },
  { key: "contact", href: "/contact" },
];

const byKey = (keys: NavKey[]) => keys.map((k) => NAV_ITEMS.find((i) => i.key === k)!);

/** Shown directly in the desktop header. */
export const PRIMARY_NAV = byKey(["home", "about", "programs", "olympiads", "quizzes", "assessment", "games"]);
/** Collapsed under "More" on desktop. */
export const SECONDARY_NAV = byKey(["campus", "team", "achievements", "psychology", "surveys", "contact"]);

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
