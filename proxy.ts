import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Next 16 "proxy" (formerly middleware): applies locale routing.
export default createMiddleware(routing);

export const config = {
  // Skip: /api, /admin, /school, /_next, /_vercel and anything with a file extension.
  matcher: ["/((?!api|admin|school|_next|_vercel|icon|apple-icon|opengraph-image|twitter-image|.*\\..*).*)"],
};
