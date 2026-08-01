import {
  loginInputSchema,
  sessionResponseSchema,
  type AuthenticatedUser,
  type LoginInput,
} from "@amazon-2/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ApiResponseError, requestEmpty, requestJson } from "../api";

type AuthState =
  | { status: "checking" }
  | { status: "authenticated"; user: AuthenticatedUser }
  | { status: "anonymous" }
  | { status: "error" };

type SignInResult =
  | { ok: true }
  | { ok: false; kind: "invalid-input" | "invalid-credentials" | "unexpected"; message: string };

interface AuthContextValue {
  state: AuthState;
  notice: string | null;
  clearNotice(): void;
  retrySession(): void;
  signIn(input: LoginInput): Promise<SignInResult>;
  signOut(): Promise<void>;
  expireSession(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [notice, setNotice] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      setState({ status: "checking" });

      try {
        const session = await requestJson("/api/auth/me", sessionResponseSchema, {
          signal: controller.signal,
        });
        setState({ status: "authenticated", user: session.user });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof ApiResponseError && error.status === 401) {
          setState({ status: "anonymous" });
          return;
        }

        setState({ status: "error" });
      }
    }

    void loadSession();
    return () => controller.abort();
  }, [bootstrapAttempt]);

  const retrySession = useCallback(() => {
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  const signIn = useCallback(async (input: LoginInput): Promise<SignInResult> => {
    const parsedInput = loginInputSchema.safeParse(input);

    if (!parsedInput.success) {
      return {
        ok: false,
        kind: "invalid-input",
        message: "Enter a valid email address and password.",
      };
    }

    try {
      const session = await requestJson("/api/auth/login", sessionResponseSchema, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedInput.data),
      });
      setNotice(null);
      setState({ status: "authenticated", user: session.user });
      return { ok: true };
    } catch (error: unknown) {
      if (
        error instanceof ApiResponseError &&
        error.apiError?.error.code === "INVALID_CREDENTIALS"
      ) {
        return {
          ok: false,
          kind: "invalid-credentials",
          message: "Email or password is incorrect.",
        };
      }

      return {
        ok: false,
        kind: "unexpected",
        message: "We couldn’t sign you in. Check your connection and try again.",
      };
    }
  }, []);

  const signOut = useCallback(async () => {
    await requestEmpty("/api/auth/logout", { method: "POST" });
    setNotice(null);
    setState({ status: "anonymous" });
  }, []);

  const expireSession = useCallback(() => {
    setNotice("Your library card expired. Sign in again to continue.");
    setState({ status: "anonymous" });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      notice,
      clearNotice,
      retrySession,
      signIn,
      signOut,
      expireSession,
    }),
    [clearNotice, expireSession, notice, retrySession, signIn, signOut, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
