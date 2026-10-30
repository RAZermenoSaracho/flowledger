import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../../../hooks/useAuth";
import * as usersClient from "../../../services/users.client";
import type { User } from "../../../types/users.types";
import { useProfileUser } from "./useProfileUser";

/** Current plan plus `changePlan`, which updates the plan and surfaces failures through `planError`. */
export function usePlan() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { user } = useProfileUser();
  const [planError, setPlanError] = useState<string | null>(null);

  const updatePlan = useMutation({
    mutationFn: (planType: User["planType"]) => usersClient.updatePlan(planType),
    onSuccess: async (response) => {
      auth.setUser(response.user);
      queryClient.setQueryData(["me"], response.user);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  async function changePlan(planType: User["planType"]) {
    setPlanError(null);
    try {
      await updatePlan.mutateAsync(planType);
    } catch (caught) {
      setPlanError(caught instanceof Error ? caught.message : "Plan could not be updated");
    }
  }

  return {
    currentPlan: user?.planType ?? "free",
    changePlan,
    planError,
    isPending: updatePlan.isPending
  };
}
