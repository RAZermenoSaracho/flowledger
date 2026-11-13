import type { NotificationSlot } from "@flowledger/shared";

/** Commented starter script a new model opens with; matches the Plata example and `NEW_MODEL_SLOTS`. */
export const NEW_MODEL_CODE = `# Called once per notification. text is the raw notification text.
# Return expense(...), income(...), transfer(...) or skip("reason").
# Slot keys ("card", "general") are bound to your records on the Form tab.
def process(text, ctx):
    t = normalize(text)
    if "aprovecha" in t or "promocion" in t:
        return skip("promotion")
    m = re.search(r"compraste \\$([\\d,]+\\.\\d{2}) (\\w{3}) en (.+?) con tu tarjeta", t)
    if not m:
        return skip("not a purchase")
    return expense(amount=amount(m.group(1)), currency=m.group(2).upper(),
                   name=m.group(3).upper(), account="card", category="general")
`;

/** Slots the template script refers to. */
export const NEW_MODEL_SLOTS: NotificationSlot[] = [
  { key: "card", kind: "account", label: "Card account", required: true },
  { key: "general", kind: "category", label: "General category", required: false }
];
