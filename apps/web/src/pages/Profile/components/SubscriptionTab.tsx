import { Button } from "../../../components/Button";
import { planDescriptions, planLabels } from "../constants";
import { usePlan } from "../hooks/usePlan";

/** Current account plan with an upgrade/downgrade action. */
export function SubscriptionTab() {
  const { currentPlan, changePlan, planError, isPending } = usePlan();

  return (
    <section className="lg:max-w-xl">
      <h3 className="text-lg font-semibold">Account plan: {planLabels[currentPlan]}</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {planDescriptions[currentPlan]}
      </p>
      <div className="mt-4 grid gap-4">
        {currentPlan === "free" ? (
          <PlanOption
            title="FlowLedger One"
            description={planDescriptions.flowledger_one}
            actionLabel="Upgrade"
            onClick={() => changePlan("flowledger_one")}
            disabled={isPending}
          />
        ) : (
          <PlanOption
            title="Free"
            description={planDescriptions.free}
            actionLabel="Downgrade"
            onClick={() => changePlan("free")}
            disabled={isPending}
          />
        )}
        {planError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{planError}</p>
        ) : null}
      </div>
    </section>
  );
}

function PlanOption({
  title,
  description,
  actionLabel,
  onClick,
  disabled
}: {
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
      <h4 className="font-semibold">{title}</h4>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      <Button type="button" className="mt-4 w-full" onClick={onClick} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}
