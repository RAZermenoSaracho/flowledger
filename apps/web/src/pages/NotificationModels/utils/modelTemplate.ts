import type { NotificationSlot } from "@flowledger/shared";

/** Commented starter script a new model opens with; matches the Plata example; the minimal expense needs no slots, `NEW_MODEL_SLOTS` backs the commented optional args. */
export const NEW_MODEL_CODE = `# Called once per notification. text is the raw notification text.
# Return expense(...), income(...), transfer(...) or skip("reason").
# Only amount and name are required. Optional: account, category, group, date, currency, notes.
# Slot keys ("card", "general") are bound to your records on the Form tab.
# Currency when omitted: the bound account's currency, else your preferred currency.
def process(text, ctx):
    t = normalize(text)
    if "aprovecha" in t or "promocion" in t:
        return skip("promotion")
    m = re.search(r"compraste \\$([\\d,]+\\.\\d{2}) (\\w{3}) en (.+?) con tu tarjeta", t)
    if not m:
        return skip("not a purchase")
    return expense(amount=amount(m.group(1)), name=m.group(3).upper())
    # With optional args:
    # return expense(amount=amount(m.group(1)), name=m.group(3).upper(),
    #                account="card", category="general", currency=m.group(2).upper())
`;

/** Slots the template script refers to. */
export const NEW_MODEL_SLOTS: NotificationSlot[] = [
  { key: "card", kind: "account", label: "Card account", required: true },
  { key: "general", kind: "category", label: "General category", required: false }
];
