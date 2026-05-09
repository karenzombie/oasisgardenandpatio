import { SignIn, SignUp } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk's <SignIn /> shows a password field on the *identifier* (email) step
// purely so password managers can autofill. Clerk does NOT actually submit
// that password — it always reprompts on the next step. That made customers
// type their password twice. Hide the decorative password field on the
// identifier step so it's email-only there; the real password prompt still
// appears on the second step.
const HIDE_DECORATIVE_PASSWORD_CSS = `
  .cl-signIn-start .cl-formFieldRow__password,
  .cl-signIn-start .cl-formField__password {
    display: none !important;
  }
`;

export function SignInPage() {
  return (
    <div className="w-full bg-muted/30 flex-1 flex items-center justify-center px-4 py-16 md:py-24">
      <style>{HIDE_DECORATIVE_PASSWORD_CSS}</style>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/`}
      />
    </div>
  );
}

export function SignUpPage() {
  return (
    <div className="w-full bg-muted/30 flex-1 flex items-center justify-center px-4 py-16 md:py-24">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/`}
      />
    </div>
  );
}
