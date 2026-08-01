import { useEffect, useRef } from "react";

export function ArchiveConfirmation({
  kind,
  name,
  busy,
  returnFocus,
  onCancel,
  onConfirm,
}: {
  kind: "book" | "genre";
  name: string;
  busy: boolean;
  returnFocus: HTMLElement | null;
  onCancel(): void;
  onConfirm(): void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const cancelHandlerRef = useRef(onCancel);
  const returnFocusRef = useRef(returnFocus);
  busyRef.current = busy;
  cancelHandlerRef.current = onCancel;
  returnFocusRef.current = returnFocus;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        cancelHandlerRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]",
      );
      if (!controls || controls.length === 0) return;
      const first = controls.item(0);
      const last = controls.item(controls.length - 1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <div className="dialog-scrim" role="presentation">
      <section
        aria-describedby="archive-dialog-description"
        aria-labelledby="archive-dialog-title"
        aria-modal="true"
        className="archive-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <p className="eyebrow">Archive {kind}</p>
        <h2 id="archive-dialog-title">Archive “{name}”?</h2>
        <p id="archive-dialog-description">
          This action is reversible. You can restore this {kind} from the Archived tab.
        </p>
        <div className="archive-dialog__actions">
          <button className="button button--quiet" disabled={busy} onClick={onCancel} ref={cancelRef} type="button">
            Cancel
          </button>
          <button className="button button--destructive" disabled={busy} onClick={onConfirm} type="button">
            {busy ? "Archiving…" : "Archive"}
          </button>
        </div>
      </section>
    </div>
  );
}
