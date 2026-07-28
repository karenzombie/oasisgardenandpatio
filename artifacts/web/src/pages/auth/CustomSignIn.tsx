import { useSignIn } from "@clerk/react";
import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function CustomSignIn() {
  const { signIn, errors: clerkErrors } = useSignIn();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.password({ identifier: email, password });
      if (result.error) {
        setError(
          result.error.longMessage ??
          result.error.message ??
          "Incorrect email or password."
        );
        return;
      }
      if (signIn.status === "complete") {
        await signIn.finalize();
        setLocation("/");
      } else {
        setError("Sign-in could not be completed. Please try again.");
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { longMessage?: string; message?: string }[] };
      setError(
        clerkErr?.errors?.[0]?.longMessage ??
        clerkErr?.errors?.[0]?.message ??
        "Incorrect email or password."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!signIn) return;
    await signIn.sso({
      strategy: "oauth_google",
      redirectUrl: `${window.location.origin}${basePath}/sso-callback`,
      redirectCallbackUrl: `${window.location.origin}${basePath}/`,
    });
  }

  // Suppress unused-variable warning — clerkErrors is reactive but we use local error state
  void clerkErrors;

  return (
    <div className="w-full bg-muted/30 flex-1 flex items-center justify-center px-4 py-16 md:py-24">
      <div className="bg-card border border-border shadow-sm rounded-sm w-[440px] max-w-full overflow-hidden">
        <div className="p-8 space-y-5">
          {/* Logo */}
          <div className="flex justify-center mb-2">
            <a href={basePath || "/"}>
              <img
                src={`${basePath}/logo.svg`}
                alt="Oasis Garden and Patio"
                className="h-10 w-auto"
              />
            </a>
          </div>

          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
              Sign in to Oasis Garden and Patio
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              Welcome back! Please sign in to continue
            </p>
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-border hover:bg-muted/40 transition-colors text-foreground font-medium py-2.5 px-4 rounded-sm text-sm disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-muted-foreground text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email + password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="si-email" className="text-sm font-medium text-foreground block">
                Email address
              </label>
              <input
                id="si-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-input bg-card text-foreground rounded-sm focus:ring-2 focus:ring-ring px-3 py-2 text-sm outline-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="si-password" className="text-sm font-medium text-foreground block">
                  Password
                </label>
                <a
                  href={`${basePath}/forgot-password`}
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <input
                id="si-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-input bg-card text-foreground rounded-sm focus:ring-2 focus:ring-ring px-3 py-2 text-sm outline-none"
              />
            </div>

            {error && (
              <div className="border border-border bg-muted/40 text-foreground text-sm px-3 py-2 rounded-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-none font-serif tracking-wide py-2.5 text-sm disabled:opacity-50 transition-colors"
            >
              {loading ? "Signing in…" : "Continue"}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href={`${basePath}/sign-up`} className="text-primary hover:underline font-medium">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
