import { useEffect, useRef } from "react";

export interface AccountErrorSummaryItem {
  controlId: string;
  label: string;
  message: string;
}

interface AccountErrorSummaryProps {
  focusTrigger: number;
  items: AccountErrorSummaryItem[];
}

export function AccountErrorSummary({ focusTrigger, items }: AccountErrorSummaryProps) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    summaryRef.current?.focus();
  }, [focusTrigger]);

  return (
    <div
      aria-labelledby="account-error-summary-title"
      className="notice account-error-summary"
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
    >
      <h2 id="account-error-summary-title">Correct the highlighted fields.</h2>
      <ul>
        {items.map((item) => (
          <li key={item.controlId}>
            <a
              href={`#${item.controlId}`}
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(item.controlId)?.focus();
              }}
            >
              {item.label}: {item.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
