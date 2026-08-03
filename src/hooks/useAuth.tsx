import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { shouldSyncProfileForAuthEvent } from "@/lib/auth-events";
import type { Profile, Sector } from "@/lib/types";

interface AuthValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  sector: Sector | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sector, setSector] = useState<Sector | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedProfileUserId = useRef<string | null>(null);
  const profileRequest = useRef<{ userId: string; promise: Promise<void> } | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setSector(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("*, sectors(*)")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;

    const joined = data as (Profile & { sectors: Sector | null }) | null;
    if (!joined) {
      setProfile(null);
      setSector(null);
      return;
    }

    const { sectors: joinedSector, ...prof } = joined;
    setProfile(prof);
    setSector(joinedSector ?? null);
  }, []);

  const syncProfile = useCallback(
    (userId: string | undefined, force = false): Promise<void> => {
      if (!userId) {
        loadedProfileUserId.current = null;
        profileRequest.current = null;
        setProfile(null);
        setSector(null);
        return Promise.resolve();
      }
      if (!force && loadedProfileUserId.current === userId) return Promise.resolve();
      if (!force && profileRequest.current?.userId === userId) {
        return profileRequest.current.promise;
      }

      const promise = loadProfile(userId)
        .then(() => {
          loadedProfileUserId.current = userId;
        })
        .finally(() => {
          if (profileRequest.current?.promise === promise) profileRequest.current = null;
        });
      profileRequest.current = { userId, promise };
      return promise;
    },
    [loadProfile],
  );

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return;
      setSession(newSession);
      if (event === "SIGNED_OUT") {
        loadedProfileUserId.current = null;
        profileRequest.current = null;
        setProfile(null);
        setSector(null);
        return;
      }
      if (shouldSyncProfileForAuthEvent(event, loadedProfileUserId.current, newSession?.user.id)) {
        void syncProfile(newSession?.user.id, event === "USER_UPDATED").catch((error) => {
          console.error("[Auth] Não foi possível atualizar o perfil.", error);
        });
      }
    });

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      try {
        await syncProfile(data.session?.user.id);
      } catch (error) {
        console.error("[Auth] Não foi possível carregar o perfil.", error);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [syncProfile]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    await syncProfile(data.user?.id, true);
  }, [syncProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSector(null);
    setSession(null);
    loadedProfileUserId.current = null;
    profileRequest.current = null;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      sector,
      isAdmin: profile?.role === "admin" && profile.status === "active",
      refresh,
      signOut,
    }),
    [loading, session, profile, sector, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
