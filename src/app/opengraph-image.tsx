import { ImageResponse } from "next/og";
import { getBusinessInfo } from "@/lib/business-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Book your car detail online";

export default async function OpengraphImage() {
  const info = await getBusinessInfo();
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
          background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 38, opacity: 0.85 }}>{info.name}</div>
        <div style={{ fontSize: 74, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
          Want a deep clean but don&apos;t have the time? Let us help!
        </div>
        <div style={{ fontSize: 32, opacity: 0.9, marginTop: 24 }}>
          Professional detailing — book online in minutes.
        </div>
      </div>
    ),
    { ...size },
  );
}
