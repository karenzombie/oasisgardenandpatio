import { useEffect, useState } from "react";

interface GeoCheckResponse {
  country: string | null;
  isUS: boolean;
  message: string | null;
}

export function GeoGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "allowed" }
    | { kind: "blocked"; message: string; country: string | null }
  >({ kind: "loading" });

  useEffect(() => {
    let canceled = false;
    fetch("/api/geo/check", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<GeoCheckResponse>) : null))
      .then((d) => {
        if (canceled) return;
        if (d && d.isUS === false && d.message) {
          setState({ kind: "blocked", message: d.message, country: d.country });
        } else {
          setState({ kind: "allowed" });
        }
      })
      .catch(() => {
        if (canceled) return;
        // Network error or no edge header — fail open. Address validation is
        // the hard enforcement layer.
        setState({ kind: "allowed" });
      });
    return () => {
      canceled = true;
    };
  }, []);

  if (state.kind === "blocked") {
    return (
      <div className="fixed inset-0 z-[1000] bg-secondary text-secondary-foreground flex items-center justify-center p-6">
        <div className="max-w-lg text-center">
          <img
            src="/src/assets/logo.png"
            alt="Oasis Garden & Patio"
            className="h-16 mx-auto mb-8 object-contain filter brightness-0"
          />
          <h1 className="font-serif text-3xl md:text-4xl mb-6 leading-tight">
            Thank you for your interest.
          </h1>
          <p className="text-secondary-foreground/80 text-lg leading-relaxed">
            At this time, Oasis Garden & Patio ships to US customer locations.
          </p>
          {state.country ? (
            <p className="text-xs uppercase tracking-widest text-secondary-foreground/50 mt-10">
              Detected location: {state.country}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // While loading, render children to avoid a flash of nothing for the
  // overwhelmingly-common US case. If they turn out to be non-US, the overlay
  // mounts on top within ~200ms.
  return <>{children}</>;
}
