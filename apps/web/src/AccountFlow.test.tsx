import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PENDING_REGISTRATION_EXPIRES_IN_SECONDS } from "@amazon-2/contracts";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import {
  clearPendingRegistrationHint,
  isFreshPendingRegistrationHint,
  readPendingRegistrationHint,
  writePendingRegistrationHint,
} from "./account/pendingVerification";

const reader = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "reader@example.com",
  displayName: "Riley Reader",
  role: "READER" as const,
};

const librarian = {
  ...reader,
  id: "00000000-0000-4000-8000-000000000002",
  email: "librarian@example.com",
  displayName: "Casey Librarian",
  role: "LIBRARIAN" as const,
};

const genre = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Science Fiction",
  slug: "science-fiction",
};

const catalogueBook = {
  id: "20000000-0000-4000-8000-000000000001",
  title: "The Unwritten Atlas",
  author: "Morgan Laurent",
  publicationYear: 2024,
  rating: 4.7,
  coverSeed: "atlas-account-flow",
  genres: [genre],
};

const PENDING_HINT_KEY = "amazon-2.pending-registration-hint.v1";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function apiError(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

function dispatchResponse(email = "reader@example.com") {
  return jsonResponse({
    verification: {
      email,
      codeLength: 6,
      expiresInSeconds: 600,
      resendCooldownSeconds: 60,
    },
  }, 202);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function anonymousSession() {
  return apiError("UNAUTHENTICATED", "Authentication is required.", 401);
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current URL">{`${location.pathname}${location.search}`}</output>;
}

function HistoryProbe() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  return (
    <div>
      <output aria-label="Navigation type">{navigationType}</output>
      <button onClick={() => navigate(-1)} type="button">History back</button>
    </div>
  );
}

type MemoryEntry = NonNullable<ComponentProps<typeof MemoryRouter>["initialEntries"]>[number];

function renderApp(entry: MemoryEntry, history = false) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
      <LocationProbe />
      {history ? <HistoryProbe /> : null}
    </MemoryRouter>,
  );
}

function verificationEntry(
  email: string,
  startedAt: number,
  dispatchedAt: number | null = null,
): MemoryEntry {
  return {
    pathname: "/verify-email",
    state: {
      dispatchedAt,
      email,
      startedAt,
    },
  };
}

async function fillRegistration(browser: ReturnType<typeof userEvent.setup>) {
  await browser.type(screen.getByLabelText("Display name"), "  Rita Reader  ");
  await browser.type(screen.getByLabelText("Email address"), "RITA@Example.COM");
  await browser.type(screen.getByLabelText("Password"), "LongReaderPass1");
}

function catalogueSupportResponse(url: URL) {
  if (url.pathname === "/api/books") {
    return jsonResponse({
      books: [catalogueBook],
      meta: { page: 1, pageSize: 24, totalItems: 1, totalPages: 1 },
    });
  }
  if (url.pathname === "/api/genres") return jsonResponse({ genres: [genre] });
  if (url.pathname === "/api/me/favourite-genres") return jsonResponse({ genres: [] });
  if (url.pathname === "/api/me/reading-list") return jsonResponse({ entries: [] });
  return jsonResponse({}, 404);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearPendingRegistrationHint();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("Reader registration", () => {
  it("rejects weak input with focused linked errors, then submits exactly three normalized fields without a session", async () => {
    writePendingRegistrationHint("stale@example.com", Date.now());
    const registration = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return Promise.resolve(anonymousSession());
      if (url.pathname === "/api/auth/register") return registration.promise;
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    renderApp("/sign-up");

    expect(await screen.findByRole("heading", { name: "Create your library account" })).toBeInTheDocument();
    await waitFor(() => expect(readPendingRegistrationHint()).toBeNull());
    expect(screen.getByText("New accounts have Reader access.")).toBeInTheDocument();
    expect(document.querySelector('[name="role"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    await browser.click(screen.getByRole("button", { name: "Create reader account" }));

    const summary = screen.getByRole("alert");
    expect(summary).toHaveFocus();
    expect(within(summary).getByRole("link", { name: "Display name: Enter a display name." })).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Email address: Enter a valid email address." })).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Password: Password must be at least 12 characters." })).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("aria-describedby")?.split(" ")).toEqual([
      "registration-password-hint",
      "registration-password-error",
    ]);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/auth/register")).toBe(false);

    const submitButton = screen.getByRole("button", { name: "Create reader account" });
    submitButton.focus();
    expect(submitButton).toHaveFocus();
    await browser.click(submitButton);
    expect(summary).toHaveFocus();
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/auth/register")).toBe(false);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "  Rita Reader  " } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "RITA@Example.COM" } });
    fireEvent.change(password, { target: { value: "LongReaderPass1" } });
    await browser.click(screen.getByRole("button", { name: "Create reader account" }));

    const busyButton = screen.getByRole("button", { name: "Creating account…" });
    expect(busyButton).toBeDisabled();
    expect(busyButton.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Email address")).toHaveValue("RITA@Example.COM");
    expect(screen.getByLabelText("Email address")).toHaveAttribute("spellcheck", "false");
    const registerCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/auth/register");
    expect(registerCall?.[1]).toEqual(expect.objectContaining({
      credentials: "include",
      method: "POST",
      body: JSON.stringify({
        displayName: "Rita Reader",
        email: "rita@example.com",
        password: "LongReaderPass1",
      }),
    }));
    expect(Object.keys(JSON.parse(String(registerCall?.[1]?.body))).sort()).toEqual([
      "displayName",
      "email",
      "password",
    ]);

    await act(async () => registration.resolve(dispatchResponse("rita@example.com")));
    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(document.querySelector(".verification-status")).toHaveTextContent(
      "If a code can be delivered for this address, use the newest one. It expires in 10 minutes.",
    );
    expect(document.body).not.toHaveTextContent("rita@example.com");
    expect(screen.getByText(/r•+@example\.com/)).toBeInTheDocument();
    expect(readPendingRegistrationHint()).toEqual({
      email: "rita@example.com",
      startedAt: expect.any(Number),
    });
    expect(Object.keys(readPendingRegistrationHint() ?? {}).sort()).toEqual(["email", "startedAt"]);
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("/verify-email");
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/me")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Find your next book" })).not.toBeInTheDocument();
  });

  it("continues to verification when tab storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/register") return dispatchResponse("rita@example.com");
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/sign-up");

    await screen.findByRole("heading", { name: "Create your library account" });
    await fillRegistration(browser);
    await browser.click(screen.getByRole("button", { name: "Create reader account" }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("Code expires in 10:00");
    expect(document.querySelector(".verification-status")).toHaveTextContent(
      "If a code can be delivered for this address, use the newest one. It expires in 10 minutes.",
    );
  });

  it.each([
    ["RATE_LIMITED", 429, "Too many account requests. Wait before trying again."],
    ["SERVICE_UNAVAILABLE", 503, "Account creation is unavailable right now. Try again later."],
  ])("preserves registration values for %s", async (code, status, expected) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/register") return apiError(code, "Server detail.", status);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/sign-up");

    await screen.findByRole("heading", { name: "Create your library account" });
    await fillRegistration(browser);
    await browser.click(screen.getByRole("button", { name: "Create reader account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByLabelText("Display name")).toHaveValue("  Rita Reader  ");
    expect(screen.getByLabelText("Email address")).toHaveValue("RITA@Example.COM");
    expect(screen.getByLabelText("Password")).toHaveValue("LongReaderPass1");
  });
});

describe("Sign-in verification handoff", () => {
  it("routes only explicit EMAIL_NOT_VERIFIED to a masked pending verification flow", async () => {
    const startedAt = Date.now();
    writePendingRegistrationHint("pending@example.com", startedAt);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/login") {
        return apiError("EMAIL_NOT_VERIFIED", "Email verification is required.", 403);
      }
      if (url.pathname === "/api/auth/resend-verification") {
        return dispatchResponse("pending@example.com");
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/sign-in");

    const signInEmail = await screen.findByLabelText("Email address");
    expect(signInEmail).toHaveAttribute("spellcheck", "false");
    await browser.type(signInEmail, "PENDING@Example.com");
    await browser.type(screen.getByLabelText("Password"), "CorrectPassword1");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(document.querySelector(".verification-status")).toHaveTextContent(
      "Your account still needs email verification.",
    );
    expect(document.body).not.toHaveTextContent("pending@example.com");
    expect(screen.getByText(/p•+@example\.com/)).toBeInTheDocument();
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("/verify-email");
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText(/Resend available in/i)).not.toBeInTheDocument();
    const resendButton = screen.getByRole("button", { name: "Resend code" });
    expect(resendButton).not.toHaveAttribute("aria-disabled");
    expect(readPendingRegistrationHint()).toEqual({
      email: "pending@example.com",
      startedAt,
    });

    await browser.click(resendButton);
    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input) === "/api/auth/resend-verification"
    )).toHaveLength(1);
    expect(await screen.findByRole("timer")).toHaveTextContent("Code expires in 10:00");
    expect(screen.getByText("Resend available in 60 seconds")).toBeInTheDocument();
    expect(readPendingRegistrationHint()).toEqual({
      email: "pending@example.com",
      startedAt,
    });
  });

  it("keeps invalid credentials generic on sign in and creates no pending verification context", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/login") {
        return apiError("INVALID_CREDENTIALS", "Invalid credentials.", 401);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/sign-in");

    await browser.type(await screen.findByLabelText("Email address"), "unknown@example.com");
    await browser.type(screen.getByLabelText("Password"), "WrongPassword1");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(screen.getByRole("heading", { name: "Sign in to the open stacks" })).toBeInTheDocument();
    expect(readPendingRegistrationHint()).toBeNull();
  });

  it("clears stale pending verification context after ordinary sign in", async () => {
    writePendingRegistrationHint("stale@example.com", Date.now());
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/login") return jsonResponse({ user: reader });
      return catalogueSupportResponse(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/sign-in");

    await browser.type(await screen.findByLabelText("Email address"), reader.email);
    await browser.type(screen.getByLabelText("Password"), "CorrectPassword1");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Find your next book" })).toBeInTheDocument();
    expect(readPendingRegistrationHint()).toBeNull();
  });

  it("restarts sign-up with navigation-state email prefill when no fresh matching hint exists", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/login") {
        return apiError("EMAIL_NOT_VERIFIED", "Email verification is required.", 403);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/sign-in", true);

    await browser.type(await screen.findByLabelText("Email address"), "PENDING@Example.com");
    await browser.type(screen.getByLabelText("Password"), "CorrectPassword1");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    const heading = await screen.findByRole("heading", { name: "Create your library account" });
    expect(heading).toHaveFocus();
    expect(screen.getByText("Start sign-up again to continue email verification.")).toBeInTheDocument();
    expect(screen.getByText(
      "Enter your display name and password again. Your email address is already filled in.",
    )).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("pending@example.com");
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("/sign-up");
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("REPLACE");
    expect(screen.queryByLabelText("6-digit verification code")).not.toBeInTheDocument();
    expect(readPendingRegistrationHint()).toBeNull();
  });
});

describe("Email verification", () => {
  it("offers sign-in recovery without an email lookup when pending context is missing", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp("/verify-email");

    const recoveryHeading = await screen.findByRole("heading", { name: "Start sign-up again" });
    expect(recoveryHeading).toHaveFocus();
    expect(screen.getByText(
      "This browser no longer has a recent sign-up to continue. Enter your details again to request a new code.",
    )).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "Start sign-up again" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByLabelText("6-digit verification code")).not.toBeInTheDocument();
    expect(document.querySelector('input[type="email"]')).toBeNull();
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("/verify-email");
  });

  it.each(["malformed", "future", "stale", "mismatched"] as const)(
    "rejects a %s browser-local recovery hint on route entry",
    async (kind) => {
      const now = Date.now();
      let entry: MemoryEntry = "/verify-email";
      if (kind === "malformed") {
        window.localStorage.setItem(PENDING_HINT_KEY, JSON.stringify({
          email: "reader@example.com",
          role: "LIBRARIAN",
          startedAt: now,
        }));
      } else if (kind === "future") {
        writePendingRegistrationHint("reader@example.com", now + 60_000);
        entry = verificationEntry("reader@example.com", now + 60_000);
      } else if (kind === "stale") {
        const startedAt = now - PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1000;
        writePendingRegistrationHint("reader@example.com", startedAt);
        entry = verificationEntry("reader@example.com", startedAt);
      } else {
        writePendingRegistrationHint("other@example.com", now);
        entry = verificationEntry("reader@example.com", now);
      }
      const seededHint = readPendingRegistrationHint();
      if (kind === "future") expect(seededHint && isFreshPendingRegistrationHint(seededHint, now)).toBe(false);
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname === "/api/auth/me") return anonymousSession();
        return jsonResponse({}, 404);
      });
      vi.stubGlobal("fetch", fetchMock);
      renderApp(entry);

      expect(await screen.findByRole("heading", { name: "Start sign-up again" })).toHaveFocus();
      expect(screen.queryByLabelText("6-digit verification code")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Resend code" })).not.toBeInTheDocument();
      expect(readPendingRegistrationHint()).toBeNull();
    },
  );

  it("revalidates the hint when the document becomes visible and preserves logical focus", async () => {
    const startedAt = Date.now();
    writePendingRegistrationHint("reader@example.com", startedAt);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    renderApp(verificationEntry("reader@example.com", startedAt));

    const code = await screen.findByLabelText("6-digit verification code");
    code.focus();
    clearPendingRegistrationHint();
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    const heading = screen.getByRole("heading", { name: "Start sign-up again" });
    expect(heading).toHaveFocus();
    expect(code).not.toBeInTheDocument();
    expect(screen.getByText(
      "This browser no longer has a recent sign-up to continue. Enter your details again to request a new code.",
    )).toHaveAttribute("aria-live", "polite");
  });

  it("revalidates immediately before resend and makes no API request after local recovery is cleared", async () => {
    const startedAt = Date.now();
    writePendingRegistrationHint("reader@example.com", startedAt);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/resend-verification") return dispatchResponse();
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp(verificationEntry("reader@example.com", startedAt));

    const resend = await screen.findByRole("button", { name: "Resend code" });
    clearPendingRegistrationHint();
    await browser.click(resend);

    expect(screen.getByRole("heading", { name: "Start sign-up again" })).toHaveFocus();
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input) === "/api/auth/resend-verification"
    )).toBe(false);
  });

  it("replaces verification at the strict 24-hour boundary", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    const startedAt = Date.now() - PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1000 + 1_000;
    writePendingRegistrationHint("reader@example.com", startedAt);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp(verificationEntry("reader@example.com", startedAt));
    await act(async () => Promise.resolve());

    const code = screen.getByLabelText("6-digit verification code");
    code.focus();
    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByRole("heading", { name: "Start sign-up again" })).toHaveFocus();
    expect(code).not.toBeInTheDocument();
    expect(readPendingRegistrationHint()).toBeNull();
  });

  it("uses one paste-friendly numeric text input, preserves a leading zero, and maps server invalid states generically", async () => {
    const startedAt = Date.now();
    writePendingRegistrationHint("reader@example.com", startedAt);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/verify-email") {
        return apiError("VERIFICATION_CODE_INVALID", "Specific hidden reason.", 400);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp(verificationEntry("reader@example.com", startedAt));

    const code = await screen.findByLabelText("6-digit verification code");
    expect(code).toHaveAttribute("type", "text");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("pattern", "[0-9]*");
    expect(code).toHaveAttribute("minlength", "6");
    expect(code).toHaveAttribute("maxlength", "6");
    expect(code).toHaveAttribute("spellcheck", "false");
    expect(document.querySelectorAll('#verification-code')).toHaveLength(1);

    fireEvent.paste(code, { clipboardData: { getData: () => "012-345" } });
    expect(code).toHaveValue("012345");
    await browser.click(screen.getByRole("button", { name: "Verify email" }));

    const verifyCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/auth/verify-email");
    expect(JSON.parse(String(verifyCall?.[1]?.body))).toEqual({
      email: "reader@example.com",
      code: "012345",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That code is incorrect, expired, or no longer usable. Request a new code if needed.",
    );
    expect(code).toHaveValue("");
    expect(code).toHaveFocus();
    expect(document.body).not.toHaveTextContent("Specific hidden reason.");

    fireEvent.change(code, { target: { value: "12a456" } });
    await browser.click(screen.getByRole("button", { name: "Verify email" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 6 numbers.");
    expect(code).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/verify-email")).toHaveLength(1);
  });

  it("enforces cooldown, announces timer milestones once, and restarts both timers after one resend", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    const startedAt = Date.now();
    writePendingRegistrationHint("reader@example.com", startedAt);
    const resend = deferred<Response>();
    let resendRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return Promise.resolve(anonymousSession());
      if (url.pathname === "/api/auth/resend-verification") {
        resendRequests += 1;
        return resendRequests === 1
          ? resend.promise
          : Promise.resolve(dispatchResponse());
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderApp(verificationEntry("reader@example.com", startedAt, startedAt));
    await act(async () => Promise.resolve());

    const code = screen.getByLabelText("6-digit verification code");
    const resendButton = screen.getByRole("button", { name: "Resend code" });
    expect(screen.getByRole("timer")).toHaveTextContent("Code expires in 10:00");
    expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
    expect(resendButton).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Resend available in 60 seconds")).not.toHaveAttribute("aria-live");
    fireEvent.click(resendButton);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/auth/resend-verification")).toBe(false);

    act(() => vi.advanceTimersByTime(60_000));
    expect(resendButton).not.toHaveAttribute("aria-disabled");
    expect(document.querySelector(".verification-status")).toHaveTextContent(
      "You can request a new code.",
    );
    fireEvent.change(code, { target: { value: "123456" } });
    act(() => {
      fireEvent.click(resendButton);
      fireEvent.click(resendButton);
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/resend-verification")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Requesting code…" })).toHaveAttribute("aria-disabled", "true");

    await act(async () => resend.resolve(dispatchResponse()));
    expect(code).toHaveValue("");
    expect(screen.getByRole("timer")).toHaveTextContent("Code expires in 10:00");
    expect(screen.getByText("Resend available in 60 seconds")).toBeInTheDocument();
    expect(document.querySelector(".verification-status")).toHaveTextContent(
      "If a code can be delivered for this address, use the newest one. It expires in 10 minutes.",
    );

    act(() => vi.advanceTimersByTime(540_000));
    expect(screen.getByRole("timer")).toHaveTextContent("Code expires in 1:00");
    expect(document.querySelector(".verification-status")).toHaveTextContent(
      "One minute remains before this code expires.",
    );
    const intervalClearsBeforeExpiry = clearIntervalSpy.mock.calls.length;
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("timer")).toHaveTextContent("Code expired locally.");
    expect(screen.getByRole("alert")).toHaveTextContent("That code has expired. Request a new code.");
    expect(resendButton).toHaveFocus();
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(intervalClearsBeforeExpiry);

    await act(async () => {
      fireEvent.click(resendButton);
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input) === "/api/auth/resend-verification"
    )).toHaveLength(2);
    expect(screen.getByRole("timer")).toHaveTextContent("Code expires in 10:00");
    expect(readPendingRegistrationHint()).toEqual({ email: "reader@example.com", startedAt });
  });

  it.each([
    ["RATE_LIMITED", 429, "Too many verification requests. Wait before trying again."],
    [
      "SERVICE_UNAVAILABLE",
      503,
      "We couldn’t verify your email. Check your connection and try again.",
    ],
  ])("keeps verification context for %s", async (errorCode, status, expected) => {
    writePendingRegistrationHint("reader@example.com", Date.now());
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/verify-email") return apiError(errorCode, "Hidden detail.", status);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/verify-email");

    const code = await screen.findByLabelText("6-digit verification code");
    await browser.type(code, "123456");
    await browser.click(screen.getByRole("button", { name: "Verify email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(code).toHaveValue("123456");
  });

  it("keeps resend failures generic and focused without inventing retry seconds", async () => {
    writePendingRegistrationHint("reader@example.com", Date.now() - 61_000);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/resend-verification") {
        return apiError("RATE_LIMITED", "Retry after secret detail.", 429);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/verify-email");

    const resendButton = await screen.findByRole("button", { name: "Resend code" });
    expect(resendButton).not.toHaveAttribute("aria-disabled");
    await browser.click(resendButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resend is temporarily unavailable. Wait before trying again.",
    );
    expect(resendButton).toHaveFocus();
    expect(document.body).not.toHaveTextContent(/retry after|\d+ seconds/i);
  });

  it("hydrates the verified cookie session, replaces verification history, clears pending state, and welcomes once", async () => {
    writePendingRegistrationHint("reader@example.com", Date.now());
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return anonymousSession();
      if (url.pathname === "/api/auth/verify-email") return jsonResponse({ user: reader });
      return catalogueSupportResponse(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/verify-email", true);

    await browser.type(await screen.findByLabelText("6-digit verification code"), "012345");
    await browser.click(screen.getByRole("button", { name: "Verify email" }));

    expect(await screen.findByRole("heading", { name: "Find your next book" })).toBeInTheDocument();
    expect(screen.getAllByText("Riley Reader").length).toBeGreaterThan(0);
    expect(screen.getByText("Email verified. Welcome to the catalogue.", {
      selector: ".account-welcome-notice",
    })).toBeInTheDocument();
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("/catalogue");
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("REPLACE");
    expect(readPendingRegistrationHint()).toBeNull();
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/me")).toHaveLength(1);
    await browser.click(screen.getByRole("button", { name: "History back" }));
    expect(screen.queryByLabelText("6-digit verification code")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Find your next book" })).toBeInTheDocument();
  });
});

describe("Authenticated account", () => {
  it.each([
    ["Reader", reader],
    ["Librarian", librarian],
  ] as const)("loads and updates the %s profile without changing read-only facts", async (roleLabel, user) => {
    const initialProfile = {
      ...user,
      emailVerifiedAt: "2026-07-15T10:00:00.000Z",
      createdAt: "2025-01-02T09:00:00.000Z",
    };
    const savedProfile = { ...initialProfile, displayName: `Updated ${roleLabel}` };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return jsonResponse({ user });
      if (url.pathname === "/api/me/profile" && init?.method === "PUT") {
        return jsonResponse({ profile: savedProfile });
      }
      if (url.pathname === "/api/me/profile") return jsonResponse({ profile: initialProfile });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/account");

    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
    const accountLinks = screen.getAllByRole("link", { name: "Account" });
    expect(accountLinks).toHaveLength(2);
    accountLinks.forEach((link) => expect(link).toHaveAttribute("aria-current", "page"));
    for (const navigationName of ["Primary navigation", "Mobile primary navigation"]) {
      const navigation = screen.getByRole("navigation", { name: navigationName });
      const destinations = within(navigation).getAllByRole("link").map((link) => link.textContent);
      expect(destinations.at(-1)).toBe("Account");
      if (user.role === "LIBRARIAN") {
        expect(destinations.slice(-2)).toEqual(["Back Room", "Account"]);
      }
    }
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(screen.getByText(roleLabel, { selector: "dd" })).toBeInTheDocument();
    const times = Array.from(document.querySelectorAll("time"));
    expect(times).toHaveLength(2);
    expect(times[0]).toHaveAttribute("datetime", initialProfile.emailVerifiedAt);
    expect(times[1]).toHaveAttribute("datetime", initialProfile.createdAt);
    expect(document.body).not.toHaveTextContent(user.id);
    expect(document.querySelector('input[name="email"], input[name="role"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /password|email|delete|role/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: "Back Room" }).length > 0).toBe(
      user.role === "LIBRARIAN",
    );

    const displayName = screen.getByLabelText("Display name", { selector: "input" });
    expect(screen.getByRole("button", { name: "Save display name" })).toBeDisabled();
    await browser.clear(displayName);
    await browser.type(displayName, `Updated ${roleLabel}`);
    await browser.click(screen.getByRole("button", { name: "Save display name" }));

    const updateCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(updateCall?.[0]).toBe("/api/me/profile");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ displayName: `Updated ${roleLabel}` });
    expect(await screen.findByText("Display name updated.", {
      selector: ".account-save-status",
    })).toBeInTheDocument();
    expect(screen.getAllByText(`Updated ${roleLabel}`).length).toBeGreaterThan(1);
    expect(screen.getByLabelText("Current URL")).toHaveTextContent("/account");
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/auth/me")).toHaveLength(1);
  });

  it("shows the account loading boundary and retries a page failure", async () => {
    let profileAttempts = 0;
    const retryProfile = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return Promise.resolve(jsonResponse({ user: reader }));
      if (url.pathname === "/api/me/profile") {
        profileAttempts += 1;
        return profileAttempts === 1
          ? Promise.resolve(apiError("SERVICE_UNAVAILABLE", "Unavailable.", 503))
          : retryProfile.promise;
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();
    renderApp("/account");

    expect(await screen.findByText("We couldn’t load your account.")).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Loading your account…").closest("section")).toHaveAttribute("aria-busy", "true");
    await act(async () => retryProfile.resolve(jsonResponse({
      profile: {
        ...reader,
        emailVerifiedAt: "2026-07-15T10:00:00.000Z",
        createdAt: "2025-01-02T09:00:00.000Z",
      },
    })));
    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
  });
});
