import { ImageResponse } from "next/og";

export const alt = "PROPEPTIQ LABS — for legitimate laboratory and research use only";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        backgroundColor: "#F4F1E8",
        color: "#171915",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "76px 84px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          borderBottom: "2px solid #C9C5B8",
          display: "flex",
          fontSize: 28,
          fontWeight: 700,
          justifyContent: "space-between",
          letterSpacing: "0.1em",
          paddingBottom: 28,
        }}
      >
        <span>PROPEPTIQ LABS</span>
        <span style={{ color: "#66715B", fontSize: 22 }}>RESEARCH USE</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
        <div style={{ display: "flex", fontSize: 70, fontWeight: 600, lineHeight: 1.08 }}>
          Research materials, documented for laboratory work.
        </div>
        <div
          style={{
            borderLeft: "6px solid #66715B",
            display: "flex",
            flexDirection: "column",
            fontSize: 28,
            gap: 8,
            lineHeight: 1.3,
            marginTop: 40,
            paddingLeft: 24,
          }}
        >
          <span>For legitimate laboratory and research use only.</span>
          <span>Not for human or veterinary use.</span>
        </div>
      </div>
    </div>,
    size,
  );
}
