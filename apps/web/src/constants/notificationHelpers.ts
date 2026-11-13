/** One helper available to notification scripts, as listed in the Code tab's function reference. */
export type NotificationHelper = {
  name: string;
  signature: string;
  description: string;
  example: string;
};

/** Every helper the notification script sandbox provides, in display order. */
export const notificationHelpers: NotificationHelper[] = [
  {
    name: "expense",
    signature: "expense(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None)",
    description:
      "Proposes an expense. Only amount (a string) and name are required. account, category and group are optional slot keys, not record ids; omitted ones are never resolved. Currency when omitted: the bound account's currency, else your preferred currency (USD if you have none).",
    example: 'return expense(amount="1234.50", name="OXXO")  # or add account="card", category="general", currency="MXN"'
  },
  {
    name: "income",
    signature: "income(amount, name, account=None, category=None, group=None, date=None, currency=None, notes=None)",
    description: "Proposes an income; same arguments and currency resolution as expense.",
    example: 'return income(amount="2000.00", name="Juan Perez", account="card")'
  },
  {
    name: "transfer",
    signature: "transfer(amount, name, account, to_account, date=None, currency=None, destination_amount=None, notes=None)",
    description: "Proposes a transfer between two account slots (both required); destination_amount is for cross-currency transfers. currency is optional and resolves like expense.",
    example: 'return transfer(amount="500.00", name="Savings", account="card", to_account="savings")'
  },
  {
    name: "skip",
    signature: "skip(reason)",
    description: "Deliberately ignores the notification; the reason (at most 200 characters) is logged.",
    example: 'return skip("promotion")'
  },
  {
    name: "amount",
    signature: 'amount(s, decimal=".", thousands=",")',
    description: "Normalizes the first money value in s to a decimal string. Raises ValueError when none is found.",
    example: 'amount("$1,234.50")  # "1234.50"'
  },
  {
    name: "normalize",
    signature: "normalize(s)",
    description: "Lowercases, strips accents and collapses whitespace.",
    example: 'normalize("  Compraste   en ÓXXO ")  # "compraste en oxxo"'
  },
  {
    name: "parse_date",
    signature: "parse_date(s, fmt)",
    description: "Parses s with strptime format fmt into an ISO date or datetime string.",
    example: 'parse_date("13/11/2026", "%d/%m/%Y")'
  },
  {
    name: "Decimal",
    signature: "Decimal(value)",
    description: "decimal.Decimal, for exact money arithmetic. Amounts returned to helpers must be strings.",
    example: 'str(Decimal("10.25") * 2)  # "20.50"'
  },
  {
    name: "re",
    signature: "re.search(pattern, string) / re.match / re.findall / re.sub",
    description: "The standard regular-expression module, available without an import.",
    example: 're.search(r"\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)", t)  # the amount pattern of the default visual rule'
  }
];
