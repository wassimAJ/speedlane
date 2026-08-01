import {
  accountEmailSchema,
  PENDING_REGISTRATION_EXPIRES_IN_SECONDS,
} from "@amazon-2/contracts";

const PENDING_REGISTRATION_HINT_KEY = "amazon-2.pending-registration-hint.v1";

export interface PendingRegistrationHint {
  email: string;
  startedAt: number;
}

let memoryOnlyHint: PendingRegistrationHint | null = null;

function removeStoredHint() {
  try {
    window.localStorage.removeItem(PENDING_REGISTRATION_HINT_KEY);
  } catch {
    // Cleanup is best-effort so it cannot break authentication transitions.
  }
}

function parseHint(value: string): PendingRegistrationHint | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (Object.keys(parsed).sort().join(",") !== "email,startedAt") return null;

    const candidate = parsed as Record<string, unknown>;
    const email = accountEmailSchema.safeParse(candidate.email);
    if (
      !email.success ||
      candidate.email !== email.data ||
      typeof candidate.startedAt !== "number" ||
      !Number.isFinite(candidate.startedAt)
    ) {
      return null;
    }

    return { email: email.data, startedAt: candidate.startedAt };
  } catch {
    return null;
  }
}

export function readPendingRegistrationHint(): PendingRegistrationHint | null {
  try {
    const value = window.localStorage.getItem(PENDING_REGISTRATION_HINT_KEY);
    if (value === null) return memoryOnlyHint;
    const hint = parseHint(value);
    if (hint !== null) return hint;
    memoryOnlyHint = null;
    removeStoredHint();
    return null;
  } catch {
    return memoryOnlyHint;
  }
}

export function isFreshPendingRegistrationHint(
  hint: PendingRegistrationHint,
  now = Date.now(),
) {
  if (!Number.isFinite(now) || hint.startedAt > now) return false;
  return now - hint.startedAt < PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1000;
}

export function writePendingRegistrationHint(
  email: string,
  startedAt = Date.now(),
) {
  const hint = {
    email: accountEmailSchema.parse(email),
    startedAt,
  } satisfies PendingRegistrationHint;

  try {
    window.localStorage.setItem(PENDING_REGISTRATION_HINT_KEY, JSON.stringify(hint));
    memoryOnlyHint = null;
  } catch {
    memoryOnlyHint = hint;
  }

  return hint;
}

export function clearPendingRegistrationHint() {
  memoryOnlyHint = null;
  removeStoredHint();
}

export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, 1);
  const maskLength = Math.min(6, Math.max(2, local.length - 1));
  return `${visible}${"•".repeat(maskLength)}@${domain}`;
}
