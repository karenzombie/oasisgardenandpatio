import { useEffect, useRef, useSyncExternalStore } from "react";

type AuthDiagnosticEntry = {
  id: number;
  timestamp: string;
  message: string;
  details: unknown;
};

type AuthDiagnosticStatus = {
  isAuthenticated: boolean;
  queryStatus: string;
  hasData: boolean;
  errorStatus: number | null;
};

const listeners = new Set<() => void>();
let entries: AuthDiagnosticEntry[] = [];
let currentStatus: AuthDiagnosticStatus = {
  isAuthenticated: false,
  queryStatus: "unknown",
  hasData: false,
  errorStatus: null,
};
let nextId = 1;
let version = 0;

function emitChange(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): number {
  return version;
}

function timestampWithSeconds(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function addAuthDiagnostic(message: string, details: unknown): void {
  entries = [
    ...entries,
    {
      id: nextId,
      timestamp: timestampWithSeconds(),
      message,
      details,
    },
  ].slice(-200);
  nextId += 1;
  emitChange();
}

export function setAuthDiagnosticStatus(status: AuthDiagnosticStatus): void {
  currentStatus = status;
  emitChange();
}

export function AuthDiagnosticPanel() {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [entries.length]);

  return (
    <aside
      aria-label="Authentication diagnostics"
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 2147483647,
        width: "min(400px, calc(100vw - 24px))",
        maxHeight: 440,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid #94a3b8",
        borderRadius: 6,
        background: "#0f172a",
        color: "#f8fafc",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid #475569",
          background: "#020617",
          flex: "0 0 auto",
        }}
      >
        <strong>[AUTHDIAG] Current</strong>
        <div>
          isAuthenticated={String(currentStatus.isAuthenticated)} status=
          {currentStatus.queryStatus} data={String(currentStatus.hasData)} error=
          {currentStatus.errorStatus ?? "none"}
        </div>
      </div>
      <div
        ref={historyRef}
        style={{
          minHeight: 280,
          overflowY: "auto",
          padding: "8px 10px",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {entries.length === 0 ? (
          <div>[AUTHDIAG] Waiting for entries…</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} style={{ marginBottom: 8 }}>
              <div>
                {entry.timestamp} [AUTHDIAG] {entry.message}
              </div>
              <div style={{ color: "#cbd5e1" }}>
                {JSON.stringify(entry.details)}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}