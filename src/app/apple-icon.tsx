import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Satori (which ImageResponse uses) doesn't correctly interpret an SVG
// transform="rotate(...)" on a group — it renders the un-rotated shapes.
// The glass in the source mark is a stroked group rotated -66° about
// (66, 56); this bakes that rotation directly into each point's
// coordinates so no transform attribute is needed.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg width={180} height={180} viewBox="0 0 120 120">
        <rect width={120} height={120} rx={27} fill="#5C1A2B" />
        <path d="M40 74 L40 92 L60 92 L60 70 Z" fill="#F5EFE3" />
        <circle cx={48} cy={50} r={19} fill="#F5EFE3" />
        <path d="M66 46 L74 51 L66 56 Z" fill="#F5EFE3" />
        <rect x={27} y={42} width={40} height={8.5} rx={2.5} fill="#C3A25B" />
        <ellipse cx={28} cy={46.2} rx={5} ry={5.3} fill="#B78E42" />
        <path d="M24 43 L14 39 L18 47 Z" fill="#C3A25B" />
        <path d="M24 50 L14 55 L19 49 Z" fill="#C3A25B" />
        <path
          d="M61.93 65.14 C71.57 70.52 79.90 66.57 81.53 62.91 C83.16 59.26 80.52 50.43 70.07 46.86"
          fill="none"
          stroke="#C3A25B"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M81.53 62.91 L95.23 69.02"
          fill="none"
          stroke="#C3A25B"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <path
          d="M93.30 75.82 L100.00 63.03"
          fill="none"
          stroke="#C3A25B"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>
    ),
    { ...size },
  );
}
