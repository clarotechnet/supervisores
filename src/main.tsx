import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initializeTheme } from "./hooks/useTheme";
import "./styles.css";

initializeTheme();

const router = getRouter();
const root = document.getElementById("root");

if (!root) throw new Error("Elemento raiz não encontrado.");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
