import type { ProfileTabId } from "./types/profile.types";

/** Tabs in display order. */
export const PROFILE_TABS: { id: ProfileTabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "preferences", label: "Preferences" },
  { id: "security", label: "Security & API" },
  { id: "subscription", label: "Subscription" }
];

/** Display name per plan type. */
export const planLabels = {
  free: "Free",
  flowledger_one: "FlowLedger One"
} as const;

/** Marketing description per plan type. */
export const planDescriptions = {
  free: "Free covers the core FlowLedger experience: accounts, transactions, budgeting, and reports.",
  flowledger_one:
    "FlowLedger One adds priority support, early access to new features, and premium reporting tools on top of everything in Free."
} as const;
