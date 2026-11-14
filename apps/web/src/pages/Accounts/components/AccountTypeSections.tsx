import type { AccountType } from "@flowledger/shared";
import type { FormDraft } from "../../../types/common.types";
import type {
  AccountDraft,
  AccountTypeSectionMap
} from "../types/accounts.types";
import { CreditCardSection } from "./CreditCardSection";

/** Per-type sections for the account view; credit cards add the billing configuration. A type adds one entry here to get its own section under the shared draft. */
export const ACCOUNT_TYPE_SECTIONS: AccountTypeSectionMap = { credit_card: CreditCardSection };

/** Renders the registered section for `type`, or nothing when the type has none. `sections` is overridable for tests. */
export function AccountTypeSections({
  type,
  draft,
  sections = ACCOUNT_TYPE_SECTIONS
}: {
  type: AccountType;
  draft: FormDraft<AccountDraft>;
  sections?: AccountTypeSectionMap;
}) {
  const Section = sections[type];
  return Section ? <Section draft={draft} /> : null;
}
