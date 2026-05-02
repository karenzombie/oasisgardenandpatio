import {
  useStaffGetState,
  getStaffGetStateQueryKey,
  type StaffStageResponse,
  type StaffUser,
} from "@workspace/api-client-react";

export type StaffStage = StaffStageResponse["stage"];

export function useStaffSession() {
  const query = useStaffGetState({
    query: {
      queryKey: getStaffGetStateQueryKey(),
      retry: false,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  });
  const data = query.data;
  const stage: StaffStage = (data?.stage ?? "anonymous") as StaffStage;
  const user: StaffUser | undefined = data?.user;
  return {
    isLoading: query.isLoading,
    stage,
    user,
    refetch: query.refetch,
  };
}

/**
 * Returns an absolute path with the `~` prefix so it works correctly inside
 * wouter `nest` contexts (e.g. inside `/admin` nest, `navigate("/staff")`
 * would otherwise resolve to `/admin/staff`).
 */
export function pathForStage(stage: StaffStage, role?: "agent" | "admin") {
  switch (stage) {
    case "anonymous":
      return "~/staff";
    case "needs_2fa_setup":
      return "~/staff/setup-2fa";
    case "needs_2fa_verify":
      return "~/staff/verify-2fa";
    case "needs_password_change":
      return "~/staff/change-password";
    case "complete":
      return role === "admin" ? "~/admin" : "~/agent";
    default:
      return "~/staff";
  }
}
