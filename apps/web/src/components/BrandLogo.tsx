import type { SVGProps } from "react";

type BrandLogoProps = SVGProps<SVGSVGElement>;

/** Renders the FlowLedger brand mark and wordmark as an inline SVG. */
export function BrandLogo({
  className = "h-12 w-auto",
  ...props
}: BrandLogoProps) {
  return (
    <svg
      className={`text-ink dark:text-slate-50 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 230 64"
      aria-hidden="true"
      {...props}
    >
      <rect width="52" height="52" x="6" y="6" rx="12" fill="#176b52" />
      <path
        fill="#dff8ea"
        d="M18 16a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v32a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V16Z"
      />
      <path fill="#176b52" d="M25 22h14v4H25zM25 38h6v6h-6zM36 33h6v11h-6z" />
      <path
        fill="#f97359"
        d="M25 32c0-1.1.9-2 2-2h7.2a2 2 0 0 1 1.4.6l2 2a2 2 0 0 0 1.4.6h4v4h-5.4a2 2 0 0 1-1.4-.6l-2-2a2 2 0 0 0-1.4-.6H25v-2Z"
      />
      <text
        fill="currentColor"
        x="74"
        y="35"
        fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="22"
        fontWeight="800"
        letterSpacing="0"
      >
        FlowLedger
      </text>
      <text
        fill="currentColor"
        fillOpacity="0.65"
        x="75"
        y="51"
        fontFamily="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="9"
        fontWeight="600"
        letterSpacing=".2"
      >
        Personal finance workspace
      </text>
    </svg>
  );
}
