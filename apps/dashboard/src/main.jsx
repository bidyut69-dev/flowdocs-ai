import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import Simulator from "./pages/demo/Simulator";

// Phase 1: only the demo simulator. Login / Leads / Conversation / Settings arrive in Phase 2.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/demo/:slug" element={<Simulator />} />
        <Route path="*" element={<Navigate to="/demo/skyline-realty" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
