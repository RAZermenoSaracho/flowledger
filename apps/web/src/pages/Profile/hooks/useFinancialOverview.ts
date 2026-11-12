import { useQuery } from "@tanstack/react-query";
import { getFinancialOverview } from "../../../services/reports.client";

/** Loads the Profile financial overview (net worth and savings rate). */
export function useFinancialOverview() {
  return useQuery({
    queryKey: ["financial-overview"],
    queryFn: getFinancialOverview
  });
}
