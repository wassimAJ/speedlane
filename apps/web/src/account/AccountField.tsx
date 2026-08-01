import type { ReactNode } from "react";

interface ControlAccessibilityProps {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export function AccountField({
  children,
  controlId,
  error,
  errorIsAlert = false,
  help,
  label,
}: {
  children(props: ControlAccessibilityProps): ReactNode;
  controlId: string;
  error?: string;
  errorIsAlert?: boolean;
  help?: string;
  label: string;
}) {
  const helpId = help ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="account-field">
      <label htmlFor={controlId}>{label}</label>
      {children({
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      <div className="account-field__support">
        {help ? <p className="field-hint" id={helpId}>{help}</p> : null}
        {error ? (
          <p className="form-error" id={errorId} role={errorIsAlert ? "alert" : undefined}>
            <span className="form-error__prefix">Error: </span>{error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
