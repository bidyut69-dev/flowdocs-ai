import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Audit from "./pages/Audit";
import Landing from "./pages/Landing";
import Legal from "./pages/Legal";

// Three pages, no client-side navigation needed: links are plain page loads.
const PAGES = { "/": Landing, "/audit": Audit, "/legal": Legal };
const path = window.location.pathname.replace(/\/+$/, "") || "/";
const Page = PAGES[path] ?? Landing;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
