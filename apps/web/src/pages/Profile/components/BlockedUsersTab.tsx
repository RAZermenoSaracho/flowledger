import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RelatedList } from "../../../components/RelatedList";
import { listBlocks, unblockUser } from "../../../services/users.client";
import type { BlockedUser } from "../../../types/users.types";
import { formatPublicUser } from "../../../utils/publicUser";

/**
 * Profile "Blocked users" tab: an immediate-mode `RelatedList` (no draft, outside the Profile
 * Save). Removing a row unblocks right away and restores nothing: rejected shares stay rejected.
 */
export function BlockedUsersTab() {
  const queryClient = useQueryClient();
  const blocksQuery = useQuery({
    queryKey: ["blocks"],
    queryFn: async () => (await listBlocks()).blocks
  });
  const unblock = useMutation({
    mutationFn: (userId: string) => unblockUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["blocks"] })
  });

  return (
    <div className="grid gap-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Blocked users cannot invite you to share expenses and do not appear in your search.
      </p>
      <RelatedList<BlockedUser>
        title="Blocked users"
        rows={blocksQuery.data ?? []}
        rowKey={(block) => block.id}
        isLoading={blocksQuery.isLoading}
        error={blocksQuery.isError ? "Blocked users could not be loaded." : null}
        emptyText="You have not blocked anyone."
        canRemove={() => !unblock.isPending}
        onRemove={(block) => unblock.mutate(block.user.id)}
        columns={[
          {
            key: "user",
            header: "User",
            cell: (block) => <span className="[overflow-wrap:anywhere]">{formatPublicUser(block.user)}</span>
          },
          {
            key: "since",
            header: "Blocked on",
            cell: (block) => new Date(block.createdAt).toLocaleDateString()
          }
        ]}
      />
      {unblock.isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {unblock.error instanceof Error ? unblock.error.message : "Could not unblock this user."}
        </p>
      ) : null}
    </div>
  );
}
