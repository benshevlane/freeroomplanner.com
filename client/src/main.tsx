import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const isDebug = new URLSearchParams(window.location.search).has("debug");

function showDebugError(label: string, err: unknown) {
  if (!isDebug) return;
  const pre = document.createElement("pre");
  pre.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;z-index:99999;max-height:40vh;overflow:auto;" +
    "background:#fee;color:#900;font-size:12px;padding:12px;margin:0;white-space:pre-wrap;word-break:break-word;";
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack}` : String(err);
  pre.textContent = `[${label}] ${msg}`;
  document.body.appendChild(pre);
}

window.addEventListener("error", (event) => {
  console.error("[GlobalError]", event.error);
  showDebugError("GlobalError", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[UnhandledRejection]", event.reason);
  showDebugError("UnhandledRejection", event.reason);
});

createRoot(document.getElementById("root")!).render(<App />);
