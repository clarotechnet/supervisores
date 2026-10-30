import { useQuery } from "@tanstack/react-query";
import { fetchControlAccess } from "@/services/schedule-access";
export function useControlScheduleAccess(
  userId: string | undefined,
  isAdmin: boolean,
  city: string,
  sector: string,
  active = true,
) {
  const restricted = sector === "controle-operacional";
  const mustCheck = restricted && !isAdmin;
  const query = useQuery({
    queryKey: ["schedule-control-access", userId, city],
    queryFn: () => fetchControlAccess(city),
    enabled: active && mustCheck && Boolean(userId && city),
    staleTime: 5_000,
    refetchInterval: active && mustCheck ? 15_000 : false,
    refetchOnWindowFocus: "always",
    retry: 1,
  });
  return {
    restricted,
    allowed: !mustCheck || (query.data?.canView === true && !query.isError),
    loading: active && mustCheck && query.isPending,
    refreshing: active && mustCheck && query.isFetching,
    request: query.data?.request ?? null,
    error: mustCheck ? query.error : null,
    refetch: query.refetch,
  };
}
