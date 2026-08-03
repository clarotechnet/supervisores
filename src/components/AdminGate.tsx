import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) void navigate({ to: "/painel", replace: true });
  }, [loading, isAdmin, navigate]);

  if (!isAdmin) {
    return (
      <div className="grid min-h-[300px] place-items-center text-center">
        <div>
          <ShieldAlert className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-xs text-muted-foreground">
            Esta área é restrita a administradores.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
