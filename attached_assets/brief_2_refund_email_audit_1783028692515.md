# Agent Brief 2 of 5 -- Refund Email Audit
Oasis Garden and Patio | From: Karen / Claude | July 2026

This brief is a read-and-report task followed by a single cleanup action if confirmed. No changes should be made until the investigation is complete and reported back to Karen.

---

## Background

There are currently two code paths that could potentially send a refund-related email to a customer:

**Path A (orderStatusEmail.ts -- TEMPLATES.refunded):**
Fires when an order status is changed to "refunded" via the standard status update flow.
Sends a simple notification: "Your refund has been processed. Allow 5 to 7 business days..."

**Path B (orderStatusEmail.ts -- sendOrderRefundEmail):**
Fires from the dedicated refund action endpoint when staff processes a refund through the Process Refund modal. Sends a detailed email with gross refund amount, restocking fee if applicable, and net refund amount.

Based on the current staff portal UI, moving an order status to "Refunded" opens the Process Refund modal, which collects refund amounts and fires Path B. It is unclear whether Path A ever fires independently.

---

## Investigation Task

1. Review the order status update endpoint and confirm what happens when status is set to "refunded":
   - Does it always open the Process Refund modal?
   - Does Path A (TEMPLATES.refunded) ever fire without Path B also firing?
   - Is there any scenario where a customer could receive both emails for the same refund event?

2. Report findings to Karen before making any changes.

---

## Expected Outcome

**If Path A never fires independently:** Remove TEMPLATES.refunded and its associated sendOrderStatusEmail call for the "refunded" status from the codebase. Path B (sendOrderRefundEmail) is the correct and only refund email that should reach customers.

**If Path A can fire independently in some scenarios:** Report those scenarios to Karen so a decision can be made about whether to keep, modify, or disable Path A.

---

| Do not remove any code until findings are reported to Karen and she gives the go-ahead. Check in before proceeding to Brief 3. |
