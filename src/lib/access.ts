import type { UserRole } from "@/lib/types";

export function landingPathForRole(role: UserRole): "/admin" | "/escalas" | "/painel" {
  if (role === "admin") return "/admin";
  if (role === "controller") return "/escalas";
  return "/painel";
}

export function isPathAllowedForRole(role: UserRole, pathname: string): boolean {
  if (role === "admin") return true;
  if (role === "controller") return pathname === "/escalas" || pathname.startsWith("/escalas/");
  return !pathname.startsWith("/admin");
}

export function userRoleLabel(role: UserRole): string {
  if (role === "admin") return "Administrador";
  if (role === "controller") return "Controlador";
  return "Supervisor";
}

export function canManageSchedulesForRole(role: UserRole): boolean {
  return role === "admin" || role === "supervisor";
}
