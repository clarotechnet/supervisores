import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  ListPlus,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  hint: string;
  icon: typeof CalendarCheck;
}

const SUPERVISOR_NAV: NavItem[] = [
  { to: "/painel", label: "Minha rotina", hint: "Checklist do dia", icon: CalendarCheck },
  { to: "/tarefas", label: "Minhas tarefas", hint: "Criar tarefa avulsa", icon: ListPlus },
  { to: "/mensagens", label: "Mensagens", hint: "Conversa com a gestão", icon: MessageCircle },
  { to: "/historico", label: "Histórico", hint: "Dias anteriores", icon: ClipboardList },
  { to: "/perfil", label: "Meu perfil", hint: "Senha e preferências", icon: UserCog },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Visão geral", hint: "Todos os setores", icon: BarChart3 },
  { to: "/admin/usuarios", label: "Supervisores", hint: "Aprovações e acesso", icon: Users },
  { to: "/admin/atividades", label: "Atividades", hint: "Modelos e horários", icon: ClipboardList },
  { to: "/admin/relatorios", label: "Relatórios", hint: "Exportação CSV", icon: ShieldCheck },
  { to: "/tarefas", label: "Delegar tarefas", hint: "Para gestor ou supervisor", icon: ListPlus },
  { to: "/painel", label: "Minha rotina", hint: "Checklist do dia", icon: CalendarCheck },
  { to: "/historico", label: "Histórico", hint: "Dias anteriores", icon: ClipboardList },
  { to: "/perfil", label: "Meu perfil", hint: "Senha e preferências", icon: UserCog },
];

export function AppShell({
  children,
  areaColor,
  progress,
  progressLabel,
}: {
  children: React.ReactNode;
  areaColor?: string | undefined;
  progress?: number | undefined;
  progressLabel?: string | undefined;
}) {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = isAdmin ? ADMIN_NAV : SUPERVISOR_NAV;

  const initials = (profile?.full_name || "US")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  async function handleSignOut() {
    await signOut();
    void navigate({ to: "/", replace: true });
  }

  return (
    <div
      className="min-h-screen w-full bg-background lg:grid lg:grid-cols-[270px_minmax(0,1fr)]"
      style={areaColor ? ({ "--area": areaColor } as React.CSSProperties) : undefined}
    >
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[270px] flex-col overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-3 px-2 pb-6">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground shadow-hero">
            R
          </div>
          <div className="min-w-0">
            <strong className="block text-[17px] leading-tight">Rotina</strong>
            <small className="mt-0.5 block text-[10px] uppercase tracking-[0.13em] text-sidebar-foreground/50">
              Supervisores
            </small>
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            className="ml-auto rounded-md p-1 text-sidebar-foreground/70 lg:hidden"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-sidebar-foreground/40">
          {isAdmin ? "Administração" : "Meu setor"}
        </p>

        <nav className="grid gap-1">
          {nav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "grid grid-cols-[36px_1fr] items-center gap-2.5 rounded-xl p-2.5 text-left transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground shadow-[inset_3px_0_0_var(--area)]"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <span className="area-chip grid size-9 place-items-center rounded-lg">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-xs">{item.label}</b>
                  <small className="mt-0.5 block truncate text-[9px] text-sidebar-foreground/45">
                    {item.hint}
                  </small>
                </span>
              </Link>
            );
          })}
        </nav>

        {typeof progress === "number" && (
          <div className="mt-auto rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-4">
            <span className="text-[10px] text-sidebar-foreground/60">Progresso</span>
            <strong className="mt-1 block text-2xl">{progress}%</strong>
            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-sidebar-border">
              <i
                className="block h-full rounded-full bg-area transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <small className="text-[9px] text-sidebar-foreground/50">{progressLabel}</small>
          </div>
        )}
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-navy/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Workspace */}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-[70px] items-center justify-between gap-4 border-b border-border bg-card/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menu"
              className="rounded-lg border border-border p-2 lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-4" />
            </button>
            <div className="min-w-0">
              <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {isAdmin ? "Painel do administrador" : "Painel do supervisor"}
              </span>
              <b className="block truncate text-sm">{profile?.full_name || "Usuário"}</b>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-secondary"
            >
              <LogOut className="size-3.5" /> Sair
            </button>
            <span className="grid size-9 place-items-center rounded-full bg-navy text-[10px] font-black text-white">
              {initials}
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-14 pt-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
