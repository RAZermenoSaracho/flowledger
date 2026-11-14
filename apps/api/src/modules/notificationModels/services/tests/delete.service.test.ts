import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { deleteModel } from "../delete.service.js";

describe("deleteModel", () => {
  it("deletes scoped by id and userId", async () => {
    prismaMock.notificationModel.deleteMany.mockResolvedValue({ count: 1 });
    await deleteModel("u1", "m1");
    expect(prismaMock.notificationModel.deleteMany).toHaveBeenCalledWith({ where: { id: "m1", userId: "u1" } });
  });

  it("404s when nothing matched", async () => {
    prismaMock.notificationModel.deleteMany.mockResolvedValue({ count: 0 });
    await expect(deleteModel("u1", "m1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
