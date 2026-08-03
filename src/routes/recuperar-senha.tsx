import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha | Rotina de Supervisores" },
      {
        name: "description",
        content:
          "Receba um link por e-mail para redefinir a senha de acesso à rotina de supervisão.",
      },
      { property: "og:title", content: "Recuperar senha | Rotina de Supervisores" },
      { property: "og:description", content: "Redefina a senha da sua conta de supervisor." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível enviar o e-mail agora.");
      return;
    }
    setSent(true);
    toast.success("Se o e-mail existir, o link de redefinição foi enviado.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-card">
        <h1 className="text-xl font-extrabold">Recuperar senha</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Informe seu e-mail e enviaremos um link para criar uma nova senha.
        </p>

        {sent ? (
          <p className="mt-6 rounded-xl bg-success-soft p-4 text-xs text-success-foreground">
            Verifique sua caixa de entrada e siga o link recebido.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
              />
            </div>
            <Button type="submit" disabled={busy} className="h-11">
              {busy ? "Enviando..." : "Enviar link"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="font-semibold text-primary">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
