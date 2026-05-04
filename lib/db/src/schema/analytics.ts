import {
  pgTable,
  bigserial,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Lightweight visitor / funnel analytics.
 *
 * One row per tracked event. Event types:
 *  - 'visit'              — anon or known user landed on the site (debounced once per browser session)
 *  - 'auth_prompt'        — user was redirected to log in / sign up from a gated page
 *  - 'signup_completed'   — anon user successfully created an account
 *  - 'login_completed'    — anon user successfully signed in
 *
 * `anonymousId` is a UUID generated client-side and persisted in localStorage,
 * letting us de-duplicate visitors and join an `auth_prompt` to its eventual
 * `signup_completed` / `login_completed` (or its absence = abandonment).
 */
export const analyticsEventsTable = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventType: text("event_type").notNull(),
    anonymousId: text("anonymous_id"),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    path: text("path"),
    // For auth_prompt events: which gated page triggered it (cushions, checkout, account, …)
    reason: text("reason"),
    referrer: text("referrer"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("analytics_events_event_type_idx").on(t.eventType),
    index("analytics_events_anonymous_id_idx").on(t.anonymousId),
    index("analytics_events_created_at_idx").on(t.createdAt),
  ],
);

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
