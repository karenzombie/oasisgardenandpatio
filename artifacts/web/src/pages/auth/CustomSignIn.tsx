import { useAuth as useClerkAuth } from "@clerk/react";
import { Redirect } from "wouter";
import { SignInForm } from "@/components/auth/SignInForm";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

function getPostSignInRedirect(): string {
  const fallback = "/account";
  const requested = new URLSearchParams(window.location.search).get(
    "redirect_url",
  );
  if (!requested) return fallback;

  try {
    // An explicitly schemed URL is never accepted, even when it names the
    // current origin.
    try {
      new URL(requested);
      return fallback;
    } catch {
      // Expected for relative destinations; validate those against our origin.
    }

    const parsed = new URL(requested, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return stripBase(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return fallback;
  }
}

export function CustomSignIn() {
  const { isLoaded, isSignedIn } = useClerkAuth();

  // Once Clerk reports the session as active, navigate away from the sign-in
  // page. Driving the redirect from state (rather than inline after finalize())
  // guarantees the form never stays on screen after a successful sign-in,
  // regardless of timing between finalize() and Clerk's React state update.
  if (isLoaded && isSignedIn) {
    return <Redirect to={getPostSignInRedirect()} />;
  }

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

          <SignInForm showGoogle />

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
