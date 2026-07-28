import { Redirect } from "wouter";

/**
 * The token-based password reset flow has been superseded by Clerk's native
 * reset flow (email code → new password).  Any link pointing to this route is
 * now stale — send the visitor to /forgot-password to start a fresh reset.
 */
export default function ResetPassword() {
  return <Redirect to="/forgot-password" />;
}
