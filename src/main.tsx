import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { How } from "./components/how";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* visitors who ask their system for less motion get fades in place of movement */}
    <MotionConfig reducedMotion="user">{location.pathname.replace(/\/$/, "") === "/how" ? <How /> : <App />}</MotionConfig>
  </StrictMode>,
);
