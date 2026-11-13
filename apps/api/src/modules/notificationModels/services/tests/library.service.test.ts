import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../read.service.js", () => ({ assertBindingsValid: vi.fn() }));

const { getLibraryModel, installModel, listLibrary, publishModel, updateFromSource } = await import("../library.service.js");

const slot = (key: string, kind = "account", required = true) => ({ key, kind, label: key, required });
const version = {
  id: "v2", modelId: "src", version: 2, name: "Src", description: "d", code: "new code",
  slots: [slot("card"), slot("cat", "category")], settings: { a: "default-a", b: "default-b" }, createdAt: new Date("2026-01-02")
};

beforeEach(() => {
  prismaMock.$transaction.mockImplementation(((fn: (tx: unknown) => unknown) => fn(prismaMock)) as never);
});

describe("publishModel", () => {
  it("creates max+1 snapshot without bindings and sets public", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue({
      id: "m1", name: "N", description: null, code: "c", slots: [], settings: { k: "v" }, bindings: { card: "a1" }
    } as never);
    prismaMock.notificationModelVersion.aggregate.mockResolvedValue({ _max: { version: 2 } } as never);
    await publishModel("u1", "m1");
    const data = prismaMock.notificationModelVersion.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ modelId: "m1", version: 3, name: "N", code: "c", settings: { k: "v" } });
    expect(data).not.toHaveProperty("bindings");
    expect(prismaMock.notificationModel.update).toHaveBeenCalledWith({ where: { id: "m1" }, data: { visibility: "public" } });
  });

  it("starts at version 1 and 404s for a foreign model", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue(null);
    await expect(publishModel("u2", "m1")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.notificationModel.findFirst).toHaveBeenCalledWith({ where: { id: "m1", userId: "u2" } });
    expect(prismaMock.notificationModelVersion.create).not.toHaveBeenCalled();
  });
});

describe("library reads", () => {
  it("lists entries with the author username only and no code", async () => {
    prismaMock.notificationModel.findMany.mockResolvedValue([{ id: "src", user: { username: "ana" }, versions: [version] }] as never);
    const [entry] = await listLibrary();
    expect(entry).toMatchObject({ modelId: "src", version: 2, author: { username: "ana" } });
    expect(JSON.stringify(entry)).not.toMatch(/email|new code|bindings/);
  });

  it("returns the latest version's code for one model and 404s when not public", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue({ id: "src", user: { username: "ana" }, versions: [version] } as never);
    expect((await getLibraryModel("src")).code).toBe("new code");
    prismaMock.notificationModel.findFirst.mockResolvedValue(null);
    await expect(getLibraryModel("src")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("installModel", () => {
  it("creates a private inactive copy with empty bindings from the latest version", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue({ versions: [version] } as never);
    await installModel("u2", "src");
    expect(prismaMock.notificationModel.create.mock.calls[0]![0].data).toMatchObject({
      userId: "u2", code: "new code", bindings: {}, isActive: false, visibility: "private", sourceVersionId: "v2"
    });
  });
});

describe("updateFromSource", () => {
  const current = {
    id: "c1", userId: "u2", name: "Mine", code: "mine",
    slots: [slot("card"), slot("cat", "account")], bindings: { card: "a1", cat: "a2" },
    settings: { a: "mine-a", gone: "x" }, sourceVersion: { modelId: "src" }
  };
  beforeEach(() => {
    prismaMock.notificationModel.findFirst.mockResolvedValue(current as never);
    prismaMock.notificationModelVersion.findFirst.mockResolvedValue(version as never);
  });

  it("keeps name, same key+kind bindings and merges settings; drops a binding whose kind changed", async () => {
    await expect(updateFromSource("u2", "c1", { versionId: "v2" })).rejects.toMatchObject({
      statusCode: 400, details: { unboundSlots: ["cat"] }
    });
    expect(prismaMock.notificationModel.update).not.toHaveBeenCalled();

    await updateFromSource("u2", "c1", { versionId: "v2", bindings: { cat: "c9" } });
    const { data } = prismaMock.notificationModel.update.mock.calls[0]![0];
    expect(data).toMatchObject({
      code: "new code", sourceVersionId: "v2", bindings: { card: "a1", cat: "c9" },
      settings: { a: "mine-a", b: "default-b" }
    });
    expect(data).not.toHaveProperty("name");
  });

  it("404s for a foreign model or a version outside the source, 400s without a source", async () => {
    prismaMock.notificationModelVersion.findFirst.mockResolvedValue(null);
    await expect(updateFromSource("u2", "c1", { versionId: "x" })).rejects.toMatchObject({ statusCode: 404 });
    prismaMock.notificationModel.findFirst.mockResolvedValue({ ...current, sourceVersion: null } as never);
    await expect(updateFromSource("u2", "c1", { versionId: "v2" })).rejects.toMatchObject({ statusCode: 400 });
    prismaMock.notificationModel.findFirst.mockResolvedValue(null);
    await expect(updateFromSource("u3", "c1", { versionId: "v2" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
