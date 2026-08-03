import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppNotifications } from "@/components/AppNotifications";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/", replace: true });
      return;
    }
    if (profile && profile.status !== "active") {
      void navigate({ to: "/aguardando", replace: true });
    }
  }, [loading, session, profile, navigate]);

  if (loading || !session || !profile || profile.status !== "active") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <AppNotifications />
      <Outlet />
    </>
  );
}
