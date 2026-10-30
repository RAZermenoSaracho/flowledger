import {
  addGroupMemberToolSchema,
  createGroupCategoryToolSchema,
  groupCategorySchema,
  groupSchema,
  optionalIdToolSchema,
  removeGroupMemberToolSchema,
  searchUsersToolSchema,
  requestSettlementToolSchema,
  setArchivedToolSchema,
  settlementRequestSchema,
  sharedExpenseSchema,
  updateGroupSchema,
  updateGroupToolSchema
} from "@flowledger/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { capList } from "../../../utils/listCap.js";
import { createSettlementRequest } from "../../debts/services/create.service.js";
import { addGroupCategory, addGroupMember, createGroup } from "../../groups/services/create.service.js";
import { removeGroupMember } from "../../groups/services/delete.service.js";
import { getMemberGroup, listGroups } from "../../groups/services/read.service.js";
import { archiveGroup, restoreGroup, updateGroup } from "../../groups/services/update.service.js";
import { createSharedExpense } from "../../shared-expenses/services/create.service.js";
import {
  assertOwnedGroupTransaction,
  getSharedExpenseById,
  listSharedExpenses
} from "../../shared-expenses/services/read.service.js";
import { searchUsers } from "../../users/services/read.service.js";
import type { McpAuth } from "../types/mcp.types.js";
import { runRead, runWrite } from "../utils/runTool.js";

const READ_ONLY = { readOnlyHint: true } as const;
const SHARED_EXPENSES_CAP = 100;
const RETRY_NOTE = " Not idempotent: retrying a failed or timed-out call may create a duplicate.";

/** Registers the group read tools (`list_groups`, `list_shared_expenses`, `search_users`); an optional `id` returns one record instead of the list. */
export function registerGroupReadTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "list_groups",
    {
      description:
        "List the groups the user belongs to, or pass `id` for one group with its members and categories. Only groups the user is a member of are visible.",
      inputSchema: optionalIdToolSchema.shape,
      annotations: READ_ONLY
    },
    ({ id }) =>
      runRead(async () =>
        id ? { group: await getMemberGroup(userId, id) } : { groups: await listGroups(userId, undefined) }
      )
  );

  server.registerTool(
    "list_shared_expenses",
    {
      description:
        "List shared expenses the user owns or participates in (at most 100 rows; `total` is the full count), or pass `id` for one.",
      inputSchema: optionalIdToolSchema.shape,
      annotations: READ_ONLY
    },
    ({ id }) =>
      runRead(async () => {
        if (id) return { sharedExpense: await getSharedExpenseById(userId, id) };
        const { data, total } = capList(await listSharedExpenses(userId, undefined), SHARED_EXPENSES_CAP);
        return { sharedExpenses: data, total };
      })
  );

  server.registerTool(
    "search_users",
    {
      description:
        "Find other FlowLedger users by name or email substring (at least 3 characters, at most 10 results) to get the `userId` for `add_group_member`. Returns only id, name and email; the user themself is excluded.",
      inputSchema: searchUsersToolSchema.shape,
      annotations: READ_ONLY
    },
    (args) =>
      runRead(async () => {
        const { q, limit } = searchUsersToolSchema.parse(args);
        return { users: await searchUsers(userId, q, limit) };
      })
  );
}

/**
 * Registers the group write tools. Callers register them only for credentials holding `write`; every handler
 * re-checks via `runWrite`. Group membership and admin rules are enforced by the services. There is deliberately
 * no tool to approve or reject settlements or delete groups or shared expenses, or update shared expenses.
 */
export function registerGroupWriteTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "create_group",
    {
      description: `Create a group; the user becomes its admin.${RETRY_NOTE}`,
      inputSchema: groupSchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.create_group", null, async () => {
        const group = await createGroup(userId, groupSchema.parse(args));
        return { data: { group }, resourceId: group.id, status: 201 };
      })
  );

  server.registerTool(
    "update_group",
    {
      description:
        "Rename or re-describe a group by id. Group admins only. Affects every member of the group, who see the new name.",
      inputSchema: updateGroupToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.update_group", args.id, async () => {
        const { id, ...rest } = args;
        const group = await updateGroup(userId, id, updateGroupSchema.parse(rest));
        return { data: { group }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "set_group_archived",
    {
      description:
        "Archive (`archived: true`) or restore (`archived: false`) a group. Group admins only. Affects every member of the group. Groups are never hard-deleted.",
      inputSchema: setArchivedToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.set_group_archived", args.id, async () => {
        const { id, archived } = setArchivedToolSchema.parse(args);
        const group = await (archived ? archiveGroup : restoreGroup)(userId, id);
        return { data: { group }, resourceId: id, status: 200 };
      })
  );

  server.registerTool(
    "remove_group_member",
    {
      description:
        "Remove a member from a group (omit `userId` to leave the group yourself; removing someone else requires being a group admin). Revokes the removed user's access to the group's categories; they lose access to the group. Affects another user. Confirm with the user before calling.",
      inputSchema: removeGroupMemberToolSchema.shape,
      annotations: { destructiveHint: true, idempotentHint: false }
    },
    async (args) =>
      runWrite(auth, "mcp.remove_group_member", args.groupId, async () => {
        const { groupId, userId: target = userId } = removeGroupMemberToolSchema.parse(args);
        await removeGroupMember(userId, groupId, target);
        return { data: { removed: true, groupId, userId: target }, resourceId: groupId, status: 200 };
      })
  );

  server.registerTool(
    "add_group_member",
    {
      description: `Add another user (by \`userId\` from \`search_users\`) to a group the user administers. Group admins only. Affects another user: they are added immediately without consent, are notified, and gain access to the group's data and categories. Confirm with the user before calling.${RETRY_NOTE}`,
      inputSchema: addGroupMemberToolSchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.add_group_member", args.groupId, async () => {
        const { groupId, userId: target } = addGroupMemberToolSchema.parse(args);
        const member = await addGroupMember(userId, groupId, target);
        return { data: { member }, resourceId: groupId, status: 201 };
      })
  );

  server.registerTool(
    "create_group_category",
    {
      description: `Create a shared category in a group the user administers. Group admins only. Affects every member of the group, who all get access to the new category.${RETRY_NOTE}`,
      inputSchema: createGroupCategoryToolSchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.create_group_category", args.groupId, async () => {
        const { groupId, ...rest } = createGroupCategoryToolSchema.parse(args);
        const category = await addGroupCategory(userId, groupId, groupCategorySchema.parse(rest));
        return { data: { category }, resourceId: groupId, status: 201 };
      })
  );

  server.registerTool(
    "create_shared_expense",
    {
      description: `Split one of the user's group transactions among group members. The transaction must belong to a group and participants must be members of that group; shares must add up to the transaction amount. Notifies every participant and creates debts for them.${RETRY_NOTE}`,
      inputSchema: sharedExpenseSchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.create_shared_expense", null, async () => {
        const body = sharedExpenseSchema.parse(args);
        await assertOwnedGroupTransaction(userId, body.transactionId);
        const sharedExpense = await createSharedExpense(userId, body);
        return { data: { sharedExpense }, resourceId: sharedExpense.id, status: 201 };
      })
  );

  server.registerTool(
    "request_settlement",
    {
      description: `Ask a creditor to confirm a payment for one of the user's debts (debtor only; the debt must be outstanding and have no pending request). Notifies the creditor, who must approve it themselves; nothing is moved until then.${RETRY_NOTE}`,
      inputSchema: requestSettlementToolSchema.shape
    },
    async (args) =>
      runWrite(auth, "mcp.request_settlement", args.debtId, async () => {
        const { debtId, ...rest } = requestSettlementToolSchema.parse(args);
        const settlementRequest = await createSettlementRequest(userId, debtId, settlementRequestSchema.parse(rest));
        return { data: { settlementRequest }, resourceId: settlementRequest.id, status: 201 };
      })
  );
}
