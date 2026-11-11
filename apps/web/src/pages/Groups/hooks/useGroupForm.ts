import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFormDraft } from "../../../hooks/useFormDraft";
import * as groupsClient from "../../../services/groups.client";
import type { Group } from "../../../types/groups.types";
import type { GroupDraft } from "../types/groups.types";
import { validateGroupDraft } from "../utils/groupValidation";

/**
 * Group adapter over `useFormDraft`: `initial` comes from the group (`null` while it loads), `save`
 * sends one `PUT /groups/:id` (blank description becomes `null`) and then invalidates `groups`.
 */
export function useGroupForm(group: Group | null) {
  const queryClient = useQueryClient();

  const initial = useMemo<GroupDraft | null>(
    () =>
      group && { name: group.name, description: group.description ?? "" },
    [group]
  );

  return useFormDraft<GroupDraft>({
    initial,
    validate: validateGroupDraft,
    save: async (values) => {
      if (!group) return;
      await groupsClient.updateGroup(group.id, {
        name: values.name.trim(),
        description: values.description.trim() || null
      });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });
}
