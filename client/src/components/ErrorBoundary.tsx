import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const isDebug = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
    const hasMatchMedia = typeof window !== "undefined" && typeof window.matchMedia === "function";
    const hasLocalStorage = (() => { try { return typeof localStorage !== "undefined"; } catch { return false; } })();

    console.error("[ErrorBoundary]", error, info.componentStack);
    console.error("[ErrorBoundary] env:", { ua, hasMatchMedia, hasLocalStorage });

    this.setState({ errorInfo: info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>
            Your room plan is auto-saved. Reload to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "8px 20px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {this.state.error && (
            <p style={{ color: "#999", fontSize: 11, marginTop: 12, fontFamily: "monospace" }}>
              {this.state.error.name}: {this.state.error.message}
            </p>
          )}
          {isDebug && this.state.error && (
            <pre style={{
              marginTop: 24,
              padding: 16,
              background: "#f5f5f5",
              borderRadius: 8,
              fontSize: 12,
              textAlign: "left",
              overflow: "auto",
              maxHeight: 300,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
              {this.state.errorInfo?.componentStack && (
                <>
                  {"\n\nComponent Stack:"}
                  {this.state.errorInfo.componentStack}
                </>
              )}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
