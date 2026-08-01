import type { CSSProperties } from "react";

const COVER_PALETTES = [
  ["#C43D32", "#F6F1E4", "#1B1B1B"],
  ["#2D5684", "#E8E0D1", "#6B5844"],
  ["#245B45", "#FFFDF7", "#C43D32"],
  ["#6B5844", "#F6F1E4", "#2D5684"],
] as const;

function seedHash(seed: string): number {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

export function BookCover({
  seed,
  compact = false,
  posterTitle,
}: {
  seed: string;
  compact?: boolean;
  posterTitle?: string;
}) {
  const hash = seedHash(seed);
  const palette = COVER_PALETTES[hash % COVER_PALETTES.length] ?? COVER_PALETTES[0];
  const style = {
    "--cover-background": palette[0],
    "--cover-paper": palette[1],
    "--cover-ink": palette[2],
    "--cover-turn": `${(hash % 9) - 4}deg`,
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={`book-cover${compact ? " book-cover--compact" : ""}${posterTitle ? " book-cover--poster" : ""}`}
      style={style}
    >
      <span className="book-cover__label">
        <span className="book-cover__label-rule" />
      </span>
      <span className="book-cover__shape book-cover__shape--one" />
      <span className="book-cover__shape book-cover__shape--two" />
      <span className="book-cover__rule" />
      {posterTitle ? (
        <span className="book-cover__poster-copy">
          <span className="book-cover__poster-title">{posterTitle}</span>
          <span className="book-cover__poster-imprint">Amazon 2.0 Library</span>
        </span>
      ) : null}
    </span>
  );
}
