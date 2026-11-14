# notification-model-rules Specification

## Purpose
Offer a visual rule builder that reads and writes the model's Python script, which stays the single source of truth, so Form and Code edit the same definition.

## Requirements

### Requirement: One script, two editable views

A notification model SHALL have exactly one processing definition, its Python script. The Form's visual rules SHALL be derived from that script and never stored or executed separately. The Playground and real ingestion SHALL always execute the saved script.

#### Scenario: Rules built in Form run identically
- **WHEN** a user builds a rule in Form that skips texts without "purchase completed for", extracts `\$\s*([\d,]+(?:\.\d{1,2})?)` and creates an expense named "Purchase completed", then saves
- **THEN** the Code tab shows the equivalent Python, and both the Playground and real ingestion of "Purchase completed for $150.00" produce an expense of `150.00` named "Purchase completed" in the default currency, with no account or category

### Requirement: Form edits update the code deterministically

Changing visual rules SHALL immediately regenerate readable, canonical Python in the same unsaved draft. The same rules SHALL always generate the same code.

#### Scenario: Edit a rule
- **WHEN** the user changes the expense name in Form and switches to Code
- **THEN** the code reflects the new name without having saved, and nothing else in the script differs from the canonical generation

### Requirement: Code edits update the form when representable

When the user returns to Form after editing the script, the system SHALL parse it with Python's syntax tree. When the script is within the supported subset, the system SHALL show the corresponding rules without changing the code. Opening Form SHALL never rewrite the code.

#### Scenario: Edit code, see rules
- **WHEN** the user changes the regex in Code and opens Form
- **THEN** the rule shows the new regex and the code is unchanged

#### Scenario: Round trip
- **WHEN** any supported rule set is converted to code and parsed back
- **THEN** the parsed rules equal the original rules in canonical form: case-insensitive text is lower-cased, and a single condition counts as "all"

### Requirement: Unsupported code is never lost

When the script cannot be represented faithfully, Form SHALL show a notice listing the unsupported constructs with line numbers, SHALL NOT show an approximate rule set, and SHALL leave the code and Code tab untouched. Replacing such a script with visual rules SHALL require an explicit confirmation that states the whole script will be replaced. Invalid Python SHALL show the syntax error without discarding the code. Such scripts SHALL keep executing.

#### Scenario: Unsupported construct
- **WHEN** the script contains a `for` loop or a `print` call and the user opens Form
- **THEN** Form lists the construct and its line, offers no editable rules, and the script still runs in the Playground

#### Scenario: Explicit replacement
- **WHEN** the user chooses to replace an unsupported script and confirms
- **THEN** the draft code becomes the generated code of the default rules; cancelling leaves it unchanged

### Requirement: Supported visual rules

The visual builder SHALL support:
- text normalization;
- ordered rules, each with contains, not-contains, regex-match and regex-not-match conditions (each optionally case-insensitive) combined with all or any;
- one optional regex extraction (search or match) with a skip reason when it does not match;
- an action of skip with a reason, or expense, income or transfer, whose amount and name are fixed values or capture groups, with optional account, to-account, category and group slots, currency and notes (fixed or captured), and a captured date with a format;
- a fallback skip reason when no rule applies.

Transfers SHALL require account and to-account. Expense and income SHALL require only amount and name.

#### Scenario: Ordered rules
- **WHEN** rule 1 skips texts containing "promo" and rule 2 creates an expense for texts containing "purchase"
- **THEN** "promo purchase $5.00" is skipped with rule 1's reason, "purchase $5.00" creates an expense, and any other text is skipped with the fallback reason
