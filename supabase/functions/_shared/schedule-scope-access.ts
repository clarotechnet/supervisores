/** Consultation grants never confer management of Controle operacional. */
export function canManageScheduleScope(role: string, sector: string): boolean {
  return role === "admin" || (role === "supervisor" && sector !== "controle-operacional");
}
export class ScheduleScopeForbidden extends Error {
  constructor() {
    super("Apenas administrador pode gerenciar a escala de Controle operacional.");
    this.name = "ScheduleScopeForbidden";
  }
}
export function requireScheduleManagement(role: string, sector: string): void {
  if (!canManageScheduleScope(role, sector)) throw new ScheduleScopeForbidden();
}
