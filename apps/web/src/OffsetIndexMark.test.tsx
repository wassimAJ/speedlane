import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OffsetIndexMark } from "./components/OffsetIndexMark";

describe("Offset Index mark", () => {
  it("renders the approved full geometry and its simplified micro variant", () => {
    const { container, rerender } = render(<OffsetIndexMark size={64} />);
    const mark = container.querySelector("[data-offset-index-mark]");

    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("focusable", "false");
    expect(mark).toHaveAttribute("viewBox", "0 0 64 64");
    expect(mark).toHaveAttribute("width", "64");
    expect(mark?.querySelector('[data-mark-part="rear-card"]')).toHaveAttribute("x", "20");
    expect(mark?.querySelector('[data-mark-part="rear-card"]')).toHaveAttribute("y", "8");
    expect(mark?.querySelector('[data-mark-part="rear-card"]')).toHaveAttribute("width", "36");
    expect(mark?.querySelector('[data-mark-part="rear-card"]')).toHaveAttribute("height", "44");
    expect(mark?.querySelector('[data-mark-part="front-card"]')).toHaveAttribute("x", "8");
    expect(mark?.querySelector('[data-mark-part="front-card"]')).toHaveAttribute("y", "14");
    expect(mark?.querySelector('[data-mark-part="front-card"]')).toHaveAttribute("width", "38");
    expect(mark?.querySelector('[data-mark-part="front-card"]')).toHaveAttribute("height", "42");
    expect(mark?.querySelector('[data-mark-part="front-card"]')).toHaveAttribute("stroke-width", "4");
    expect(mark?.querySelectorAll('[data-mark-part="ledger-rule"]')).toHaveLength(2);
    expect(mark?.querySelector('[data-mark-part="accession-stamp"]')).toHaveAttribute("cx", "35");
    expect(mark?.querySelector('[data-mark-part="accession-stamp"]')).toHaveAttribute("cy", "46");
    expect(mark?.querySelector('[data-mark-part="accession-stamp"]')).toHaveAttribute("r", "5");

    rerender(<OffsetIndexMark size={18} variant="micro" />);
    const micro = container.querySelector("[data-offset-index-mark]");
    expect(micro).toHaveAttribute("width", "18");
    expect(micro?.querySelectorAll('[data-mark-part="ledger-rule"]')).toHaveLength(1);
    expect(micro?.querySelector('[data-mark-part="ledger-rule"]')).toHaveAttribute("d", "M15 30H36");
    expect(micro?.querySelector('[data-mark-part="accession-stamp"]')).not.toBeInTheDocument();

    rerender(<OffsetIndexMark size={64} variant="reversed" />);
    expect(container.querySelector('[data-mark-part="rear-card"]')).toHaveAttribute("fill", "#F6F1E4");
    expect(container.querySelector('[data-mark-part="front-card"]')).toHaveAttribute("fill", "#1B1B1B");
    expect(container.querySelector('[data-mark-part="accession-stamp"]')).toHaveAttribute("fill", "#F6F1E4");

    rerender(<OffsetIndexMark size={64} variant="one-color" />);
    expect(container.querySelector('[data-mark-part="rear-card"]')).toHaveAttribute("fill", "currentColor");
    expect(container.querySelector('[data-mark-part="front-card"]')).toHaveAttribute(
      "fill",
      "var(--offset-index-background, #F6F1E4)",
    );
    expect(container.querySelector('[data-mark-part="accession-stamp"]')).toHaveAttribute(
      "fill",
      "currentColor",
    );
  });
});
