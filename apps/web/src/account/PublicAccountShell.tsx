import { useEffect, useRef, type ReactNode } from "react";

import { OffsetIndexMark } from "../components/OffsetIndexMark";

export function PublicAccountShell({
  children,
  eyebrow,
  footer,
  focusHeading = false,
  heading,
  support,
  supportIsStatus = false,
}: {
  children: ReactNode;
  eyebrow: string;
  footer?: ReactNode;
  focusHeading?: boolean;
  heading: string;
  support: ReactNode;
  supportIsStatus?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading, heading]);

  return (
    <main className="sign-in-page public-account-page" id="main-content">
      <section aria-labelledby="public-account-title" className="sign-in-sheet public-account-sheet">
        <div className="sign-in-lockup">
          <OffsetIndexMark size={40} />
          <span>Amazon 2.0</span>
        </div>
        <p className="eyebrow">{eyebrow}</p>
        <h1
          id="public-account-title"
          ref={headingRef}
          tabIndex={focusHeading ? -1 : undefined}
        >
          {heading}
        </h1>
        <p
          aria-atomic={supportIsStatus ? "true" : undefined}
          aria-live={supportIsStatus ? "polite" : undefined}
          className="lede"
          role={supportIsStatus ? "status" : undefined}
        >
          {support}
        </p>
        {children}
        {footer ? <p className="public-account-footer">{footer}</p> : null}
        <p className="independence-note">
          Amazon 2.0 is an independent library platform and is not affiliated with Amazon.
        </p>
      </section>
    </main>
  );
}
