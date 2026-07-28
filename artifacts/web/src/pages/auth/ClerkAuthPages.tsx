import { SignUp } from "@clerk/react";
import { CustomSignIn } from "./CustomSignIn";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function SignInPage() {
  return <CustomSignIn />;
}

export function SignUpPage() {
  return (
    <div className="w-full bg-muted/30 flex-1 flex items-center justify-center px-4 py-16 md:py-24">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/account`}
      />
    </div>
  );
}
