export type PaymentStateKind =
  | "api_paid"
  | "api_held"
  | "api_not_completed"
  | "manual"
  | "balance_due"
  | "unpaid";

export interface OrderPaymentState {
  kind: PaymentStateKind;
  /**
   * True when ANY payment on this order has a stored gateway response and
   * status = "pending". Independent of the headline `kind` so the double-charge
   * nudge can fire even when a manual payment has already settled the order
   * (kind = "manual").
   */
  hasLiveApiHold: boolean;
}

export const CUSTOMER_PAYMENT_LABEL: Record<PaymentStateKind, string> = {
  api_paid:          "Paid",
  api_held:          "Under review",
  api_not_completed: "Payment not completed, please contact us",
  manual:            "Processed manually",
  balance_due:       "Balance due",
  unpaid:            "",
};

export const STAFF_PAYMENT_LABEL: Record<PaymentStateKind, string> = {
  api_paid:          "Paid",
  api_held:          "Under review",
  api_not_completed: "Not completed",
  manual:            "Processed manually",
  balance_due:       "Balance due",
  unpaid:            "Unpaid",
};

interface PaymentLike {
  status: string;
  rawResponse: unknown;
}

/**
 * Derive the headline payment state for an order from its payment rows.
 * Only needs `status` and `rawResponse` — fetch just those two columns when
 * loading payments purely for display purposes.
 *
 * Precedence (highest wins):
 *  1. Any API payment with status = "completed"  → api_paid
 *  2. Any manual payment with status = "completed" → manual
 *  3. Any API payment with status = "pending"    → api_held
 *  4. Any API payment voided or failed           → api_not_completed
 *  5. Otherwise                                  → unpaid
 *
 * `hasLiveApiHold` is always computed independently and may be true even when
 * `kind` is "manual" (order settled manually while an API hold is still open).
 *
 * `isPaidInFull` must be true (order.balance_due === 0) for the manual branch
 * to return "manual". A completed manual payment with a remaining balance
 * returns "balance_due" instead — a deposit arrangement, not a full settlement.
 */
export function deriveOrderPaymentState(
  payments: PaymentLike[],
  isPaidInFull: boolean,
): OrderPaymentState {
  const hasLiveApiHold = payments.some(
    (p) => p.rawResponse != null && p.status === "pending",
  );

  if (payments.some((p) => p.rawResponse != null && p.status === "completed"))
    return { kind: "api_paid", hasLiveApiHold };
  if (payments.some((p) => p.rawResponse == null && p.status === "completed"))
    return isPaidInFull
      ? { kind: "manual", hasLiveApiHold }
      : { kind: "balance_due", hasLiveApiHold };
  if (hasLiveApiHold)
    return { kind: "api_held", hasLiveApiHold };
  if (
    payments.some(
      (p) =>
        p.rawResponse != null &&
        (p.status === "voided" || p.status === "failed"),
    )
  )
    return { kind: "api_not_completed", hasLiveApiHold };

  return { kind: "unpaid", hasLiveApiHold: false };
}
