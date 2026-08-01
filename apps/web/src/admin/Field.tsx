import type { ReactNode } from "react";

interface ControlAccessibilityProps {
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

export function Field({
  controlId,
  label,
  labelSuffix,
  help,
  error,
  children,
}: {
  controlId: string;
  label: string;
  labelSuffix?: ReactNode;
  help?: string;
  error?: string;
  children(props: ControlAccessibilityProps): ReactNode;
}) {
  const helpId = help ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="admin-field" data-field={controlId}>
      <label htmlFor={controlId}>
        {label}
        {labelSuffix ? <> {labelSuffix}</> : null}
      </label>
      <div className="admin-field__control">
        {children({
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })}
      </div>
      <FieldSupport controlId={controlId} error={error} help={help} />
    </div>
  );
}

export function FieldRow({ paired = false, children }: { paired?: boolean; children: ReactNode }) {
  return (
    <div className={paired ? "admin-field-row admin-field-row--paired" : "admin-field-row"}>
      {children}
    </div>
  );
}

export function FieldSupport({
  controlId,
  help,
  error,
  reserve = false,
}: {
  controlId: string;
  help?: string;
  error?: string;
  reserve?: boolean;
}) {
  const empty = !help && !error;

  return (
    <div
      className={`admin-field__support${help ? " admin-field__support--with-help" : ""}${error ? " admin-field__support--with-error" : ""}${empty ? " admin-field__support--empty" : ""}${reserve ? " admin-field__support--reserved" : ""}`}
      data-support-for={controlId}
    >
      {help ? <span className="field-hint" id={`${controlId}-hint`}>{help}</span> : null}
      {error ? (
        <span className="form-error" id={`${controlId}-error`}>
          <span className="form-error__prefix">Error: </span>
          {error}
        </span>
      ) : null}
    </div>
  );
}
