import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // router-core 1.171.15 can dereference an evicted match after an awaited
    // hover preload (#7759). Load on navigation until the upstream fix is adopted.
    defaultPreload: false,
    defaultPreloadStaleTime: 60_000,
  });

  return router;
};
