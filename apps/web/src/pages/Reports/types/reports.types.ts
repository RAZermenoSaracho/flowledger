/** Whether a report displays net (income minus expenses) or gross amounts. */
export type ReportAmountMode = "net" | "gross";

/** Date range, group, and category filters applied to a report. */
export type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  groupIds: string[];
  categoryIds: string[];
};
