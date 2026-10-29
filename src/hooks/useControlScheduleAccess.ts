import { useQuery } from "@tanstack/react-query";
import { fetchControlAccess } from "@/services/schedule-access";
export function useControlScheduleAccess(
  userId: string | undefined,
  isAdmin: boolean,
  city: string,
  sector: string,
) {
  const restricted = sector === "controle-operacional";
  const mustCheck = restricted && !isAdmin;
  const query = useQuery({
    queryKey: ["schedule-control-access", userId, city],
    queryFn: () => fetchControlAccess(city),
    enabled: mustCheck && Boolean(userId && city),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });
  return {
    restricted,
    allowed: !mustCheck || (query.data?.canView === true && !query.isError),
    loading: mustCheck && query.isPending,
    request: query.data?.request ?? null,
    error: mustCheck ? query.error : null,
    refetch: query.refetch,
  };
}
