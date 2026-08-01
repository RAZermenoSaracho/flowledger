export type ReportAmountMode = "net" | "gross";

export type ReportFilters = {
  dateFrom: string;
  dateTo: string;
  groupIds: string[];
  categoryIds: string[];
};
