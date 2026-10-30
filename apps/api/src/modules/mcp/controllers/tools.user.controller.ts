import {
  markNotificationsReadInputSchema,
  markNotificationsReadToolSchema,
  updateUserPreferencesSchema
} from "@flowledger/shared";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { publicUser } from "../../../utils/serialize.js";
import {
  markAllNotificationsRead,
  markNotificationRead
} from "../../notifications/services/update.service.js";
import { updatePreferences } from "../../users/services/preferences.service.js";
import type { McpAuth } from "../types/mcp.types.js";
import { runWrite } from "../utils/runTool.js";

/**
 * Registers the credential owner's own-state write tools: preferences (name and default currency only) and
 * notification read state. Callers register them only for credentials holding `write`; handlers re-check via `runWrite`.
 */
export function registerUserWriteTools(server: McpServer, auth: McpAuth) {
  const userId = auth.extra.userId;

  server.registerTool(
    "update_preferences",
    {
      description:
        "Update the user's display name and/or default currency (preferredCurrency, null clears it). Email, password and plan cannot be changed here.",
      inputSchema: updateUserPreferencesSchema.innerType().shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.update_preferences", userId, async () => {
        const user = await updatePreferences(userId, updateUserPreferencesSchema.parse(args));
        return { data: { user: publicUser(user) }, resourceId: userId, status: 200 };
      })
  );

  server.registerTool(
    "mark_notifications_read",
    {
      description:
        "Mark one notification read (`id`) or all of the user's unread notifications read (`all: true`). Provide exactly one.",
      inputSchema: markNotificationsReadToolSchema.shape,
      annotations: { idempotentHint: true }
    },
    async (args) =>
      runWrite(auth, "mcp.mark_notifications_read", args.id ?? null, async () => {
        const input = markNotificationsReadInputSchema.parse(args);
        if (input.id) {
          const notification = await markNotificationRead(userId, input.id);
          return { data: { notification }, resourceId: input.id, status: 200 };
        }
        await markAllNotificationsRead(userId);
        return { data: { allRead: true }, resourceId: userId, status: 200 };
      })
  );
}
