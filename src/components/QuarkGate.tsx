import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function QuarkGate({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();
  const allowed =
    profile?.status === "active" && (profile.role === "admin" || profile.role === "supervisor");

  useEffect(() => {
    if (!loading && !allowed) {
      void navigate({ to: "/painel", replace: true });
    }
  }, [loading, allowed, navigate]);

  if (!allowed) {
    return (
      <div className="grid min-h-[300px] place-items-center text-center">
        <div>
          <ShieldAlert className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-xs text-muted-foreground">
            Esta área é restrita à gestão e supervisão.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
