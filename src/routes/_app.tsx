import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { AppNotifications } from "@/components/AppNotifications";
import { useAuth } from "@/hooks/useAuth";
import { isPathAllowedForRole, landingPathForRole } from "@/lib/access";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!session) {
      void navigate({ to: "/", replace: true });
      return;
    }
    if (profile && profile.status !== "active") {
      void navigate({ to: "/aguardando", replace: true });
      return;
    }
    if (profile && !isPathAllowedForRole(profile.role, pathname)) {
      void navigate({ to: landingPathForRole(profile.role), replace: true });
    }
  }, [loading, session, profile, pathname, navigate]);

  if (
    loading ||
    !session ||
    !profile ||
    profile.status !== "active" ||
    !isPathAllowedForRole(profile.role, pathname)
  ) {
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
