import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";

// Note: React hook errors may occur during Vite HMR server restarts (development only).
// This is a known limitation of Vite Fast Refresh with complex components.
// Refresh the page manually after server restarts. Does not affect production builds.

initTheme();
createRoot(document.getElementById("root")!).render(<App />);
