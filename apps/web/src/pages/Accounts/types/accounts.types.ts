import type { AccountType, PaymentDueRule } from "@flowledger/shared";
import type { ComponentType } from "react";
import type { FormDraft } from "../../../types/common.types";

/** Constructor for the Syncfy authentication widget SDK, loaded dynamically at runtime. */
export type SyncfyWidgetConstructor = new (params: {
  token: string;
  element: string;
  config: Record<string, unknown>;
}) => {
  open: () => void;
  on?: (eventName: string, callback: (...args: unknown[]) => void) => void;
  setEntrypointCredential?: (idCredential: string) => void;
  setEntrypointUpdateCredential?: (idCredential: string) => void;
};

/** Which flow the Syncfy widget should open into: fresh connect, credential resync, or credential update. */
export type SyncfyWidgetEntrypoint =
  | { type: "connect" }
  | { type: "credential"; idCredential: string }
  | { type: "updateCredential"; idCredential: string };

/** Event/result payload the Syncfy widget reports back when a flow settles. */
export type SyncfyWidgetResult =
  | { event: "success" | "updated" | "closed"; credential?: unknown }
  | { event: "error" | "socket-error" | "api-error"; credential?: unknown };

/** Editable account fields as held by the account Form View draft; numeric inputs stay strings while typed and an empty string means "unset". The last six are credit-card-only. */
export type AccountDraft = {
  name: string;
  type: AccountType;
  identifier: string;
  currency: string;
  initialBalance: string;
  creditLimit: string;
  statementClosingDay: string;
  paymentDueRule: PaymentDueRule | "";
  paymentDueValue: string;
  billingTimeZone: string;
  annualInterestRate: string;
};

/** Props of a type-specific section rendered inside the account Form View. */
export type AccountTypeSectionProps = {
  draft: FormDraft<AccountDraft>;
};

/** Registry of optional per-account-type sections. */
export type AccountTypeSectionMap = Partial<
  Record<AccountType, ComponentType<AccountTypeSectionProps>>
>;
