import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";

/** Deletes one of the caller's models; its runs and published versions cascade. 404 when missing or foreign. */
export async function deleteModel(userId: string, id: string) {
  const { count } = await prisma.notificationModel.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound("Notification model");
}
