import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { Spinner } from "@/components/ui/spinner";
import { useStaffSession, pathForStage } from "./lib/staffSession";

interface RequireStaffProps {
  children: (user: NonNullable<ReturnType<typeof useStaffSession>["user"]>) => ReactNode;
  requireRole?: "admin";
}

export function RequireStaff({ children, requireRole }: RequireStaffProps) {
  const { isLoading, stage, user } = useStaffSession();

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F5F7FA]">
        <Spinner className="size-8 text-[#1A3C5E]" />
      </div>
    );
  }

  if (stage !== "complete" || !user) {
    return <Redirect to={pathForStage(stage, user?.role)} replace />;
  }

  if (requireRole === "admin" && user.role !== "admin") {
    return <Redirect to="~/agent" replace />;
  }

  return <>{children(user)}</>;
}
