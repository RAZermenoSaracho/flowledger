import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CurrencySelect } from "../../../components/CurrencySelect";
import { EditableField } from "../../../components/EditableField";
import { FinancialOverviewSection } from "./FinancialOverviewSection";
import { planLabels } from "../constants";
import type { useProfileDetails } from "../hooks/useProfileDetails";

/**
 * Account summary with a directly editable currency and a link to manage the current plan.
 * `children` render below the details as an open area for read-only sections.
 */
export function GeneralTab({
  profile,
  children
}: {
  profile: ReturnType<typeof useProfileDetails>;
  children?: ReactNode;
}) {
  const { user, draft } = profile;

  return (
    <>
      <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">Plan</dt>
          <dd className="mt-1 text-ink dark:text-slate-100">
            {user ? planLabels[user.planType] : "Loading..."}{" "}
            <Link
              to="?tab=subscription"
              replace
              className="font-semibold text-pine underline-offset-2 hover:underline dark:text-emerald-300"
            >
              Manage plan
            </Link>
          </dd>
        </div>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <dt className="font-medium text-slate-500 dark:text-slate-400">
            Preferred currency
          </dt>
          <dd className="mt-1 text-ink dark:text-slate-100">
            <EditableField
              label="Preferred currency"
              hideLabel
              dirty={draft.changedKeys.includes("preferredCurrency")}
              onRevert={() => draft.revertField("preferredCurrency")}
            >
              <CurrencySelect
                label="Preferred currency"
                hideLabel
                value={profile.values.preferredCurrency}
                onChange={(value) => draft.setField("preferredCurrency", value)}
                disabled={profile.isLoading || draft.isSaving}
                allowNoPreference
              />
            </EditableField>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500 dark:text-slate-400">
            Member since
          </dt>
          <dd className="mt-1 text-ink dark:text-slate-100">
            {profile.memberSince ?? "Loading..."}
          </dd>
        </div>
      </dl>
      {children}
      <FinancialOverviewSection />
    </>
  );
}
