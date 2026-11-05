import { Link } from "react-router-dom";
import { planLabels } from "../constants";
import type { useProfileDetails } from "../hooks/useProfileDetails";
import { CurrencySelect } from "../../../components/CurrencySelect";
import { ProfileInlineField } from "./ProfileInlineField";

/** Account summary with editable currency and a link to manage the current plan. */
export function GeneralTab({
  profile
}: {
  profile: ReturnType<typeof useProfileDetails>;
}) {
  const { user } = profile;

  return (
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
          <ProfileInlineField
            label="Currency"
            hideLabel
            display={
              profile.isLoading
                ? "Loading..."
                : profile.values.preferredCurrency !==
                    (profile.user?.preferredCurrency ?? "")
                  ? profile.values.preferredCurrency || "Not set"
                  : profile.currencyLabel
            }
            disabled={profile.isLoading || profile.isSaving}
            onRevert={() => profile.revertField("preferredCurrency")}
          >
            <CurrencySelect
              label="Preferred currency"
              value={profile.values.preferredCurrency}
              onChange={(value) => profile.setField("preferredCurrency", value)}
              disabled={profile.isLoading || profile.isSaving}
              allowNoPreference
            />
          </ProfileInlineField>
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
  );
}
