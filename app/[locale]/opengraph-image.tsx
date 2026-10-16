import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Children's Academy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TAGLINE: Record<string, string> = {
  uz: "Bilim. Xarakter. Kelajak.",
  en: "Knowledge. Character. Future.",
};

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public", "logo.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #14253f 0%, #1d3557 45%, #457b9d 85%, #f4b942 130%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={160} height={160} alt="" style={{ borderRadius: 80, border: "4px solid #f4b942" }} />
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>Children&apos;s Academy</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 44, opacity: 0.95 }}>{TAGLINE[locale] ?? TAGLINE.en}</div>
      </div>
    ),
    size,
  );
}