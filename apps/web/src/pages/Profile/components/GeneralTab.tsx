import { Link } from "react-router-dom";
import { planLabels } from "../constants";
import { useProfileUser } from "../hooks/useProfileUser";

/** Read-only account summary not shown in the header: current plan (links to the Subscription tab). */
export function GeneralTab() {
  const { user } = useProfileUser();

  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
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
    </dl>
  );
}
