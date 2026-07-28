import { HandleSSOCallback } from "@clerk/react";
import { useLocation } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SSOCallbackPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="w-full flex-1 flex items-center justify-center py-24">
      <HandleSSOCallback
        navigateToApp={() => setLocation("/")}
        navigateToSignIn={() => setLocation(`${basePath}/sign-in`)}
        navigateToSignUp={() => setLocation(`${basePath}/sign-up`)}
      />
    </div>
  );
}
