import { useCallback } from "react";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentUserQueryKey,
  useLogout,
} from "@workspace/api-client-react";

export function useCustomerLogout(onComplete: () => void) {
  const { signOut: clerkSignOut } = useClerk();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    try {
      await clerkSignOut().catch(() => {});
      await logoutMutation.mutateAsync().catch(() => {});
    } finally {
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      queryClient.setQueryData(getGetCurrentUserQueryKey(), undefined);
      onComplete();
    }
  }, [clerkSignOut, logoutMutation, onComplete, queryClient]);

  return {
    logout,
    isPending: logoutMutation.isPending,
  };
}