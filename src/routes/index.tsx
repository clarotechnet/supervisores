import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Acesse o checklist diário da sua rotina de supervisão: atividades por horário, atrasos, observações e histórico.",
      },
      { property: "og:title", content: "Entrar | Rotina de Supervisores" },
      {
        property: "og:description",
        content: "Checklist diário das rotinas de supervisão por setor.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, profile, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    if (!profile) return;
    if (profile.status !== "active") void navigate({ to: "/aguardando", replace: true });
    else void navigate({ to: isAdmin ? "/admin" : "/painel", replace: true });
  }, [loading, session, profile, isAdmin, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("Invalid login")
          ? "E-mail ou senha inválidos."
          : "Não foi possível entrar. Tente novamente.",
      );
      return;
    }
    toast.success("Bem-vindo de volta!");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hero-surface hidden flex-col justify-between p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary text-xl font-black text-primary-foreground">
            R
          </div>
          <div>
            <strong className="block text-lg">Rotina de Supervisores</strong>
            <small className="text-[11px] uppercase tracking-[0.16em] opacity-70">
              Operação · COP · MDU · Manutenção
            </small>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-black leading-tight">
            Toda a rotina do turno em um só lugar.
          </h1>
          <p className="mt-4 text-sm opacity-80">
            109 atividades organizadas por setor e horário, com controle de atrasos, observações,
            histórico diário e relatórios para a gestão.
          </p>
          <ul className="mt-8 grid gap-2 text-xs opacity-80">
            <li>• Checklist do dia gerado automaticamente</li>
            <li>• Atualização em tempo real para a supervisão</li>
            <li>• Histórico e exportação em CSV</li>
          </ul>
        </div>
        <small className="text-[11px] opacity-60">
          Fuso horário de referência: America/Fortaleza
        </small>
      </section>

      <section className="flex items-center justify-center bg-background px-5 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-extrabold">Entrar</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Use o e-mail cadastrado para acessar sua rotina.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link to="/recuperar-senha" className="text-[11px] font-semibold text-primary">
                  Esqueci minha senha
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={busy} className="mt-2 h-11">
              {busy ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Ainda não tem acesso?{" "}
            <Link to="/cadastro" className="font-semibold text-primary">
              Solicitar cadastro
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
