import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { parseApiBase } from "./load/api-base.js";
import "./styles.css";

const container = document.getElementById("root");
if (container !== null) {
  const apiBase = parseApiBase(import.meta.env.VITE_SEXTON_API);
  createRoot(container).render(
    <StrictMode>
      <App
        fetchFn={window.fetch.bind(window)}
        apiBase={apiBase}
        initialSearch={window.location.search}
        pageOrigin={window.location.origin}
      />
    </StrictMode>,
  );
}
