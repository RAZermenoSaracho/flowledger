import type {
  AccountType,
  HoldingKind,
  HoldingValuation,
  PaymentDueRule
} from "@flowledger/shared";
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

/** Editable account fields as held by the account Form View draft; numeric inputs stay strings while typed and an empty string means "unset". The six credit-card fields are credit-card-only; `holdings` is empty for accounts without a Holdings tab. */
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
  holdings: HoldingDraft[];
};

/** Props of a type-specific section rendered inside the account Form View. */
export type AccountTypeSectionProps = {
  draft: FormDraft<AccountDraft>;
};

/** Registry of optional per-account-type sections. */
export type AccountTypeSectionMap = Partial<
  Record<AccountType, ComponentType<AccountTypeSectionProps>>
>;

/** Price source choice of a holdings row. */
export type HoldingPriceSource = "automatic" | "manual";

/** One holdings row inside the account draft. `id` is `null` until saved; `valuation` is the last saved API valuation (`null` for a new row). Numeric inputs stay strings; empty price means "no manual price"; `manualPricedAt` is a `datetime-local` value. */
export type HoldingDraft = {
  draftId: string;
  id: string | null;
  kind: HoldingKind;
  /** Ticker, crypto code or fiat currency; empty for `other`, which is identified by `name`. */
  code: string;
  name: string;
  unit: string;
  /** Where the unit price comes from: `automatic` is the Binance quote (crypto only); everything else is priced by the manual price. Ignored for cash, which is valued at par. */
  priceSource: HoldingPriceSource;
  quantity: string;
  manualUnitPrice: string;
  manualPriceCurrency: string;
  manualPricedAt: string;
  valuation: HoldingValuation | null;
};
