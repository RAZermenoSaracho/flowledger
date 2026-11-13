import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ActionMenuItem } from "../../components/ActionMenu";
import { Card } from "../../components/Card";
import { FormView } from "../../components/FormView";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import * as sharedExpensesClient from "../../services/sharedExpenses.client";
import type { FormViewTab } from "../../types/common.types";
import { formatMoney } from "../../utils/currency";
import { SharedExpenseGeneralTab } from "./components/SharedExpenseGeneralTab";
import { SharedExpenseParticipantsTab } from "./components/SharedExpenseParticipantsTab";
import { useSharedExpenseForm } from "./hooks/useSharedExpenseForm";
import { splitDirectionLabel } from "./utils/sharedExpenseDisplay";

const listLink = `${routes.debts}?tab=sharedExpenses`;

/** Shared Expense Form View at `/debts/shared-expenses/:id`: owners edit title and status and jump to the transaction to manage participants; participants get a read-only view. Unknown or inaccessible ids show the same not-found state. */
export function SharedExpenseDetailPage() {
  const { id = "" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const sharedExpenseQuery = useQuery({
    queryKey: ["shared-expense", id],
    queryFn: async () => (await sharedExpensesClient.getSharedExpense(id)).sharedExpense
  });
  const sharedExpense = sharedExpenseQuery.data ?? null;
  const draft = useSharedExpenseForm(sharedExpense);

  if (sharedExpenseQuery.isLoading) {
    return <Card>Loading...</Card>;
  }
  if (!sharedExpense) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Shared expense not found</h1>
        <Link to={listLink} className="text-pine underline">
          Back to shared expenses
        </Link>
      </Card>
    );
  }

  const isOwner = sharedExpense.ownerUserId === auth.user?.id;
  const currency = sharedExpense.transaction?.executionCurrency ?? "USD";
  const transactionRoute = routes.transaction(sharedExpense.transactionId);
  const state = { from: location.pathname };

  const tabs: FormViewTab[] = [
    {
      id: "general",
      label: "General",
      content: (
        <SharedExpenseGeneralTab
          sharedExpense={sharedExpense}
          draft={draft}
          readOnly={!isOwner}
          currentUserId={auth.user?.id}
        />
      )
    },
    {
      id: "participants",
      label: "Participants",
      content: (
        <SharedExpenseParticipantsTab
          sharedExpense={sharedExpense}
          onManage={
            isOwner
              ? () => navigate(`${transactionRoute}?tab=sharing`, { state })
              : undefined
          }
        />
      )
    }
  ];

  return (
    <Card>
      <FormView
        title={sharedExpense.title}
        subtitle={`${formatMoney(sharedExpense.totalAmount, currency)} · ${splitDirectionLabel(sharedExpense, auth.user?.id)}`}
        draft={draft}
        tabs={tabs}
        backLink={{ to: listLink, label: "Back to shared expenses" }}
        actions={
          isOwner ? (
            <>
              <ActionMenuItem
                onClick={() => navigate(`${transactionRoute}?tab=sharing`, { state })}
              >
                Manage participants
              </ActionMenuItem>
              <ActionMenuItem onClick={() => navigate(transactionRoute, { state })}>
                Open transaction
              </ActionMenuItem>
            </>
          ) : undefined
        }
      />
    </Card>
  );
}
