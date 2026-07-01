import { ImageResponse } from "next/og";
import { birthdayCopy } from "./content";

export const alt = birthdayCopy.pageTitle;
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #5a0610 0%, #9b111f 56%, #5f0713 100%)",
          color: "#fff6df",
          position: "relative",
          overflow: "hidden",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 72,
            left: -80,
            width: 520,
            height: 64,
            display: "flex",
            background: "rgba(255, 226, 156, 0.16)",
            transform: "rotate(-18deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -76,
            bottom: 92,
            width: 560,
            height: 74,
            display: "flex",
            background: "rgba(151, 216, 255, 0.13)",
            transform: "rotate(-18deg)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 260,
            height: 260,
            borderRadius: 260,
            border: "4px solid rgba(255, 230, 160, 0.7)",
            color: "#ffe69f",
            fontSize: 132,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          50
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 34,
          }}
        >
          <div
            style={{
              color: "#fff9ea",
              fontSize: 58,
              fontWeight: 700,
              lineHeight: 1.16,
            }}
          >
            {birthdayCopy.heroName}
          </div>
          <div
            style={{
              marginTop: 10,
              color: "#ffe2a0",
              fontSize: 70,
              fontWeight: 800,
              lineHeight: 1.12,
            }}
          >
            {birthdayCopy.heroTitle}
          </div>
        </div>
        <div
          style={{
            maxWidth: 900,
            marginTop: 28,
            color: "rgba(255, 248, 226, 0.9)",
            fontSize: 28,
            lineHeight: 1.4,
            textAlign: "center",
          }}
        >
          {birthdayCopy.heroQuote}
        </div>
      </div>
    ),
    { ...size },
  );
}
