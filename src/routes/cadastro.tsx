import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SECTOR_OPTIONS } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Solicitar cadastro | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Solicite acesso à rotina de supervisão informando nome, setor e e-mail. A liberação é feita por um administrador.",
      },
      { property: "og:title", content: "Solicitar cadastro | Rotina de Supervisores" },
      {
        property: "og:description",
        content: "Peça acesso ao checklist diário do seu setor.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [sectorSlug, setSectorSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (fullName.trim().length < 3) {
      toast.error("Informe seu nome completo.");
      return;
    }
    if (!sectorSlug) {
      toast.error("Selecione o seu setor.");
      return;
    }
    if (password.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não conferem.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim(), sector_slug: sectorSlug },
      },
    });
    setBusy(false);

    if (error) {
      toast.error(
        error.message.includes("already registered")
          ? "Este e-mail já possui cadastro."
          : "Não foi possível concluir o cadastro.",
      );
      return;
    }
    toast.success("Cadastro enviado! Confirme seu e-mail e aguarde a aprovação.");
    void navigate({ to: "/aguardando" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">
            R
          </div>
          <div>
            <strong className="block text-sm">Rotina de Supervisores</strong>
            <small className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Solicitação de acesso
            </small>
          </div>
        </div>

        <h1 className="text-xl font-extrabold">Criar conta</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Após confirmar o e-mail, um administrador precisa aprovar seu acesso.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Nome completo</Label>
            <Input
              id="name"
              required
              maxLength={120}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Maria da Silva"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sector">Setor</Label>
            <Select value={sectorSlug} onValueChange={setSectorSlug}>
              <SelectTrigger id="sector">
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                {SECTOR_OPTIONS.map((option) => (
                  <SelectItem key={option.slug} value={option.slug}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="email">E-mail corporativo</Label>
            <Input
              id="email"
              type="email"
              required
              maxLength={255}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
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

          <div className="grid gap-1.5">
            <Label htmlFor="confirm-password">Confirmar senha</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
            />
          </div>

          <Button type="submit" disabled={busy} className="mt-2 h-11">
            {busy ? "Enviando..." : "Solicitar acesso"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/" className="font-semibold text-primary">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
