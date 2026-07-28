---
name: Clerk v6 useSignIn API
description: The @clerk/react v6 useSignIn() hook uses a completely different signals-based API — check this before writing any custom sign-in flow.
---

## Rule

`@clerk/react` v6 (installed as `^6.5.0`) ships a **signals-based** `useSignIn()` that returns `{ signIn, errors, fetchStatus }`. The old v4/v5 shape (`{ isLoaded, signIn, setActive }`) is gone entirely.

**Why:** Rewrote using stale v4/v5 API patterns without checking installed types first, causing a broken deploy (disabled button, then type errors on the fix pass).

**How to apply:** Any time you write a custom sign-in flow, grep the installed `@clerk/react` dist types first.

## v6 Shape

```ts
const { signIn, errors, fetchStatus } = useSignIn();
// signIn: SignInFutureResource | null
// errors: SignInErrors (NOT indexable — don't access [0])
// fetchStatus: 'idle' | 'fetching'
// NO isLoaded, NO setActive
```

## Password sign-in (one step)

```ts
const result = await signIn.password({ identifier: email, password });
if (result.error) { /* show error */ }
if (signIn.status === 'complete') {
  await signIn.finalize(); // sets the active session
  navigate('/');
}
```

## Google OAuth

```ts
await signIn.sso({
  strategy: 'oauth_google',
  redirectUrl: `${origin}/sso-callback`,
  redirectCallbackUrl: `${origin}/`,
});
```

## SSO callback route

Use `HandleSSOCallback` (NOT `AuthenticateWithRedirectCallback` — that's gone in v6).  
`HandleSSOCallback` requires all three navigation props — no defaults:

```tsx
<HandleSSOCallback
  navigateToApp={() => setLocation('/')}
  navigateToSignIn={() => setLocation('/sign-in')}
  navigateToSignUp={() => setLocation('/sign-up')}
/>
```

## Button disabled anti-pattern

Do NOT disable the submit button on `!isLoaded` — `isLoaded` doesn't exist in v6.  
Gate on `!signIn` (null check) inside the handler; the button should only be `disabled={loading}`.
