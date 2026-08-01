import { useEffect, useRef } from "react";

export interface FormErrorSummaryItem {
  controlId: string;
  label: string;
  message: string;
}

export function FormErrorSummary({ items }: { items: FormErrorSummaryItem[] }) {
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    summaryRef.current?.focus();
  }, []);

  return (
    <div
      aria-labelledby="admin-error-summary-title"
      className="notice admin-form-error admin-error-summary"
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
    >
      <h3 id="admin-error-summary-title">Correct the highlighted fields before saving.</h3>
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
