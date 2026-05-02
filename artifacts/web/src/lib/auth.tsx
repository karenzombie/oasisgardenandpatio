import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  ApiError,
  type CurrentUser,
} from "@workspace/api-client-react";

export function useAuth(): {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const query = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  const error = query.error;
  const isUnauthorized =
    error instanceof ApiError && error.status === 401;

  const user = query.data && !isUnauthorized ? query.data : null;

  return {
    user,
    isLoading: query.isLoading,
    isAuthenticated: !!user,
  };
}
