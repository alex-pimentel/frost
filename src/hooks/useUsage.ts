/**
 * Local-only counterpart of the old usage/plan hook.
 *
 * Frost has no accounts and no word limits, so usage is always zero-limit and the
 * billing actions are inert. The shape is preserved so existing call sites keep
 * compiling while the remaining paid-plan UI is being removed.
 */

interface UseUsageResult {
  plan: string;
  status: string;
  isPastDue: boolean;
  wordsUsed: number;
  wordsRemaining: number;
  limit: number;
  isSubscribed: boolean;
  isTrial: boolean;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  billingInterval: "monthly" | "annual" | null;
  isOverLimit: boolean;
  isApproachingLimit: boolean;
  resetAt: string | null;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  checkoutLoading: boolean;
  refetch: () => Promise<void>;
  openCheckout: (opts?: {
    plan?: "monthly" | "annual";
    tier?: "pro" | "business";
  }) => Promise<{ success: boolean; error?: string }>;
  openBillingPortal: () => Promise<{ success: boolean; error?: string }>;
  switchPlan: (opts: {
    plan: "monthly" | "annual";
    tier: "pro" | "business";
  }) => Promise<{ success: boolean; alreadyOnPlan?: boolean; error?: string }>;
  previewSwitchPlan: (opts: { plan: "monthly" | "annual"; tier: "pro" | "business" }) => Promise<{
    success: boolean;
    immediateAmount?: number;
    currency?: string;
    currentPriceAmount?: number;
    currentInterval?: string;
    newPriceAmount?: number;
    newInterval?: string;
    nextBillingDate?: string;
    alreadyOnPlan?: boolean;
    error?: string;
  }>;
}

const unavailable = async () => ({
  success: false as const,
  error: "Billing is not available in this local-only build",
});

const LOCAL_USAGE: UseUsageResult = {
  plan: "local",
  status: "active",
  isPastDue: false,
  wordsUsed: 0,
  wordsRemaining: Number.POSITIVE_INFINITY,
  limit: Number.POSITIVE_INFINITY,
  isSubscribed: false,
  isTrial: false,
  trialDaysLeft: null,
  currentPeriodEnd: null,
  billingInterval: null,
  isOverLimit: false,
  isApproachingLimit: false,
  resetAt: null,
  isLoading: false,
  hasLoaded: true,
  error: null,
  checkoutLoading: false,
  refetch: async () => {},
  openCheckout: unavailable,
  openBillingPortal: unavailable,
  switchPlan: unavailable,
  previewSwitchPlan: unavailable,
};

export function useUsage(): UseUsageResult {
  return LOCAL_USAGE;
}
