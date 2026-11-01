import { ImageResponse } from "next/og";
import { computeUser, type UserCard } from "@/lib/compute";
import { pctWhole } from "@/lib/format";
import { isOwner } from "@/lib/slug";

export const alt = "Share of a GitHub user's recent commits ghostwritten by AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

const INK = "#e9eaef";
const MUTED = "#9196a6";
const ACCENT = "#9d88ff";
const PAPER = "#0e0f13";
const RULE = "#2c2f3a";

export default async function Image({ params }: { params: Promise<{ login: string }> }) {
  const { login } = await params;
  let u: UserCard | null = null;
  if (isOwner(login)) {
    try {
      u = await computeUser(login);
    } catch {
      u = null;
    }
  }
  const has = !!u && u.commits > 0;
  const ticks = has ? Math.round(u!.share * 100) : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: PAPER, color: INK, padding: "52px 64px", fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: `6px solid ${INK}`, paddingBottom: 14, fontSize: 40, fontWeight: 800 }}>
          <span>ghostwritten</span>
          <span style={{ color: MUTED, fontWeight: 600, fontSize: 32 }}>@{login}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", marginTop: 24, flex: 1 }}>
          {has ? (
            <>
              <div style={{ display: "flex", fontSize: 330, fontWeight: 900, lineHeight: 0.85, letterSpacing: -12, color: INK }}>
                {pctWhole(u!.share).replace("%", "")}
                <span style={{ fontSize: 140, color: ACCENT, marginLeft: 10, marginTop: 14 }}>%</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 48, marginBottom: 18, fontSize: 38, lineHeight: 1.2, maxWidth: 440 }}>
                <span style={{ fontWeight: 800 }}>of recent commits are ghostwritten by AI agents</span>
                <span style={{ color: MUTED, fontSize: 30, marginTop: 14 }}>
                  {u!.topTool ? `Most used: ${u!.topTool}` : "No agent signature found"}
                </span>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", fontSize: 84, fontWeight: 900, lineHeight: 1 }}>
              How much of your GitHub is ghostwritten by AI?
            </div>
          )}
        </div>
        <div style={{ display: "flex", marginTop: 24 }}>
          {Array.from({ length: 100 }, (_, i) => (
            <div key={i} style={{ width: 8.4, height: 40, marginRight: 3.6, background: i < ticks ? ACCENT : RULE }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 24, color: MUTED }}>
          <span>{has ? `${u!.commits} commits sampled across ${u!.repos.length} repositories` : "Look yourself up"}</span>
          <span>Signed-only counts. Every number is a floor.</span>
        </div>
      </div>
    ),
    size,
  );
}
