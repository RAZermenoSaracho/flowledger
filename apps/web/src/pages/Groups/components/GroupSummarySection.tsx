const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function GroupSummarySection({
  summary
}: {
  summary: { totalIncome: number; totalExpenses: number; balance: number };
}) {
  return (
    <section>
      <h3 className="font-semibold">Group summary</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-md bg-slate-50 p-4 dark:bg-slate-950">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Total income
          </p>
          <p className="mt-2 break-words text-xl font-bold text-pine dark:text-emerald-300 sm:text-2xl">
            {money.format(summary.totalIncome)}
          </p>
        </div>
        <div className="rounded-md bg-slate-50 p-4 dark:bg-slate-950">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Total expenses
          </p>
          <p className="mt-2 break-words text-xl font-bold text-coral dark:text-orange-300 sm:text-2xl">
            {money.format(summary.totalExpenses)}
          </p>
        </div>
        <div className="rounded-md bg-slate-50 p-4 dark:bg-slate-950">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Balance
          </p>
          <p
            className={`mt-2 break-words text-xl font-bold sm:text-2xl ${
              summary.balance >= 0
                ? "text-pine dark:text-emerald-300"
                : "text-coral dark:text-orange-300"
            }`}
          >
            {money.format(summary.balance)}
          </p>
        </div>
      </div>
    </section>
  );
}
