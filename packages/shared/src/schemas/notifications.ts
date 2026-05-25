import { z } from "zod";
import { idSchema } from "./common.js";

export const notificationParamsSchema = z.object({
  id: idSchema
});

export type NotificationParams = z.infer<typeof notificationParamsSchema>;
