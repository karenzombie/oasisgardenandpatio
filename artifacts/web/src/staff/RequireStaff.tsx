import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Spinner } from "@/components/ui/spinner";
import { useStaffSession, pathForStage } from "./lib/staffSession";

interface RequireStaffProps {
  children: (user: NonNullable<ReturnType<typeof useStaffSession>["user"]>) => ReactNode;
  requireRole?: "admin";
}

export function RequireStaff({ children, requireRole }: RequireStaffProps) {
  const { isLoading, stage, user } = useStaffSession();
  const [loc, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (stage !== "complete") {
      const target = pathForStage(stage, user?.role);
      if (loc !== target) navigate(target);
      return;
    }
    if (requireRole === "admin" && user?.role !== "admin") {
      navigate("/agent");
    }
  }, [isLoading, stage, user?.role, requireRole, loc, navigate]);

  if (isLoading || stage !== "complete" || !user) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F5F7FA]">
        <Spinner className="size-8 text-[#1A3C5E]" />
      </div>
    );
  }

  if (requireRole === "admin" && user.role !== "admin") {
    return null;
  }

  return <>{children(user)}</>;
}
