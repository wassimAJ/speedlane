export type OffsetIndexVariant = "full" | "reversed" | "one-color" | "micro";

export function OffsetIndexMark({
  className,
  size,
  variant = "full",
}: {
  className?: string;
  size: number;
  variant?: OffsetIndexVariant;
}) {
  const reversed = variant === "reversed";
  const oneColor = variant === "one-color";
  const micro = variant === "micro";
  const paper = "#F6F1E4";
  const ink = "#1B1B1B";
  const red = "#C43D32";
  const rearFill = reversed ? paper : oneColor ? "currentColor" : red;
  const frontFill = reversed
    ? ink
    : oneColor
      ? "var(--offset-index-background, #F6F1E4)"
      : "var(--offset-index-paper, #F6F1E4)";
  const lineColor = reversed ? paper : oneColor ? "currentColor" : ink;
  const stampFill = reversed ? paper : oneColor ? "currentColor" : red;

  return (
    <svg
      aria-hidden="true"
      className={`offset-index-mark${className ? ` ${className}` : ""}`}
      data-offset-index-mark=""
      focusable="false"
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      <rect data-mark-part="rear-card" fill={rearFill} height="44" rx="2" width="36" x="20" y="8" />
      <rect
        data-mark-part="front-card"
        fill={frontFill}
        height="42"
        rx="2"
        stroke={lineColor}
        strokeWidth="4"
        width="38"
        x="8"
        y="14"
      />
      {micro ? (
        <path data-mark-part="ledger-rule" d="M15 30H36" fill="none" stroke={lineColor} strokeLinecap="square" strokeWidth="3" />
      ) : (
        <>
          <path data-mark-part="ledger-rule" d="M15 27H36" fill="none" stroke={lineColor} strokeLinecap="square" strokeWidth="3" />
          <path data-mark-part="ledger-rule" d="M15 35H36" fill="none" stroke={lineColor} strokeLinecap="square" strokeWidth="3" />
          <circle data-mark-part="accession-stamp" cx="35" cy="46" fill={stampFill} r="5" />
        </>
      )}
    </svg>
  );
}
