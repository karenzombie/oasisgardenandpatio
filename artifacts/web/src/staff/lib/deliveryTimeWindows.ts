// Fixed 1-hour store-delivery windows (Brief 6, Section 0A). The stored value
// on orders.scheduledDeliveryTime is the window START time ("HH:MM:SS").
// Keep this list in sync with artifacts/api-server/src/lib/deliveryTimeWindows.ts.
export const DELIVERY_TIME_WINDOWS: { value: string; label: string }[] = [
  { value: "08:00:00", label: "8:00 AM - 9:00 AM" },
  { value: "09:00:00", label: "9:00 AM - 10:00 AM" },
  { value: "10:00:00", label: "10:00 AM - 11:00 AM" },
  { value: "11:00:00", label: "11:00 AM - 12:00 PM" },
  { value: "12:00:00", label: "12:00 PM - 1:00 PM" },
  { value: "13:00:00", label: "1:00 PM - 2:00 PM" },
  { value: "14:00:00", label: "2:00 PM - 3:00 PM" },
  { value: "15:00:00", label: "3:00 PM - 4:00 PM" },
  { value: "16:00:00", label: "4:00 PM - 5:00 PM" },
  { value: "17:00:00", label: "5:00 PM - 6:00 PM" },
  { value: "18:00:00", label: "6:00 PM - 7:00 PM" },
];

/**
 * Normalizes a stored time value (which may come back from the API as
 * "HH:MM:SS" or "HH:MM") to the "HH:MM:SS" form used as the <option> value.
 */
function normalizeTimeValue(value: string): string {
  const parts = value.split(":");
  if (parts.length === 2) return `${value}:00`;
  return value;
}

export function deliveryTimeWindowLabel(
  value: string | null | undefined,
): string {
  if (!value) return "Not set";
  const normalized = normalizeTimeValue(value);
  const match = DELIVERY_TIME_WINDOWS.find((w) => w.value === normalized);
  return match ? match.label : "Not set";
}

export { normalizeTimeValue as normalizeDeliveryTimeValue };
