import { routes } from "../../../constants/routes";

/** Resolves an app-relative origin to a back link, falling back for missing or unsafe values. */
export function transactionBackTarget(from: unknown) {
  return typeof from === "string" && /^\/(?!\/)/.test(from)
    ? { to: from, label: "Back" }
    : { to: routes.transactions, label: "Back to transactions" };
}
