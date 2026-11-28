import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./site/Root.js";
import { parseApiBase } from "./load/api-base.js";
import "./styles.css";

const container = document.getElementById("root");
if (container !== null) {
  const apiBase = parseApiBase(import.meta.env.VITE_SEXTON_API);
  createRoot(container).render(
    <StrictMode>
      <Root fetchFn={window.fetch.bind(window)} apiBase={apiBase} pageOrigin={window.location.origin} />
    </StrictMode>,
  );
}
