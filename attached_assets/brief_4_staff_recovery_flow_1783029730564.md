# Agent Brief 4 of 5 -- Staff Recovery Flow Updates
Oasis Garden and Patio | From: Karen / Claude | July 2026

This brief covers three changes to the staff account recovery flow: removing the one-hour delay, updating the email sent to the staff member, and replacing the existing admin alert email with a new one that fires to the store's main email address.

---

## IMPORTANT RULES FOR THIS BRIEF

- Do not modify any other authentication or login logic outside of the recovery flow.
- Do not modify the staff welcome email (staffWelcomeEmail.ts).
- Do not modify the recovery finalized email (sendRecoveryFinalizedEmail) -- both the completed and cancelled variations stay exactly as-is.
- The admin cancel functionality must remain intact -- admins can still cancel a pending recovery request before the link is used.
- CRITICAL: The copy for sendRecoveryRequestedEmail was already updated in Brief 1 (item 10). When making the logic changes in this brief, do not revert, overwrite, or modify the copy changes that were made in Brief 1. Only the underlying logic is changing here -- the email body copy must remain exactly as Brief 1 left it.
- Check in with Karen after completing this brief before proceeding to Brief 5.

---

## Change 1 -- Remove the One-Hour Delay from Recovery Logic

### Current behavior
When a staff member submits a recovery request, the system sets an `availableAt` timestamp one hour in the future. The recovery link is issued immediately but does not work until that timestamp is reached.

### New behavior
Remove the one-hour delay entirely. The recovery link must be active and usable immediately upon submission. The `availableAt` logic and any associated checks that block link usage before that time must be removed from the recovery endpoint and any middleware that enforces it.

### What to keep
- The `expiresAt` timestamp -- the link should still expire after a reasonable window (keep whatever the current expiry duration is)
- The ability for an admin to cancel a pending recovery request before the link is used
- All other recovery steps the staff member goes through after clicking the link (password reset, 2FA re-enrollment, etc.)

### What to remove
- The `availableAt` field and any logic that prevents the link from working before that time
- Any database columns or schema fields used exclusively for the one-hour delay, if safe to remove (check for dependencies first and report to Karen before dropping anything from the schema)

---

## Change 2 -- Verify Staff Recovery Request Email Copy (recoveryEmail.ts -- sendRecoveryRequestedEmail)

This email is sent to the staff member who submitted the recovery request.

The copy for this email was updated in Brief 1 (item 10). Do not change the copy. Your only tasks here are:

1. Confirm the copy currently matches the Brief 1 version shown below
2. Ensure the recovery link button fires immediately with no delay
3. Confirm no IP or browser details appear in this email (those belong in the admin alert only)

### Expected body copy (set in Brief 1 -- do not modify)

```
A recovery request has been submitted for your Oasis Garden & Patio staff account. Click the link below to proceed.

[Open Recovery Link button -- green]

If you did not request this, please contact your administrator immediately.

Warm regards,
The Oasis Garden & Patio Team
```

If this copy does not match what is currently in the file, that means Brief 1 was not fully completed. Stop and report to Karen before proceeding.

---

## Change 3 -- Replace Admin Recovery Alert Email (recoveryEmail.ts -- sendRecoveryAlertEmail)

### Current behavior
The existing sendRecoveryAlertEmail fires to an admin user and includes a "Review recovery requests" button with a cancel URL, and references the one-hour delay window.

### New behavior
Replace the existing sendRecoveryAlertEmail with a new version that:
- Fires to sales@oasisgardenandpatio.com (hardcoded -- this is the store's main inbox)
- Fires at the same time as the staff member email (immediately on recovery request submission)
- Includes the staff member's email address, IP, and browser details
- Includes a warning about unauthorized access
- Includes a link to the staff accounts section of the admin portal

### New subject
`Staff account recovery requested -- Oasis Garden & Patio`

### New email title
`Staff account recovery requested`

### New body

```
A staff account recovery has been requested for [targetEmail].

Request details:
IP: [requestIp]
Browser: [requestUserAgent -- truncated to 200 characters as currently implemented]

If you do not recognize this request or believe it may be unauthorized, it is recommended that you disable this staff user immediately from the admin portal.

[Review Staff Accounts button -- navy]
```

Implementation notes:
- The "Review Staff Accounts" button must link to the staff user management section of the admin portal
- Use the existing getSiteBaseUrl() or equivalent to build this URL dynamically so it works in both Replit and production environments
- The "cancel recovery" button from the old admin alert email is no longer needed in this email -- admins who want to cancel a recovery can do so from the staff accounts page linked above
- IP and browser details must be escaped using the existing escapeHtml function
- This email uses the staff-only footer (no address or phone number) -- match the footer style used in the existing recoveryEmail.ts layout

---

## Summary of Files Affected

- `recoveryEmail.ts` -- verify sendRecoveryRequestedEmail copy matches Brief 1, replace sendRecoveryAlertEmail with new version
- Recovery endpoint(s) -- remove one-hour delay logic, keep expiry and cancel logic
- Database schema -- check for availableAt field and report to Karen before removing anything

---

| Check in with Karen after completing all three changes and confirming the recovery flow works end to end. Do not proceed to Brief 5 until Karen gives the go-ahead. |
