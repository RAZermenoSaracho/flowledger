import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  maxAvatarBytes: 2 * 1024 * 1024,
  updatePassword: vi.fn(),
  updatePlan: vi.fn(),
  updateProfile: vi.fn(),
  updateSidebarSide: vi.fn(),
  uploadAvatar: vi.fn()
}));

vi.mock("../../../../utils/multipart.js", () => ({
  readMultipartParts: vi.fn()
}));

const {
  updatePassword,
  updatePlan,
  updateProfile,
  updateSidebarSide,
  uploadAvatar
} = await import("../../services/update.service.js");
const { readMultipartParts } = await import("../../../../utils/multipart.js");
const {
  patchMe,
  patchPassword,
  patchPlan,
  patchSidebarSide,
  postAvatar
} = await import("../update.controller.js");

function userFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "ada@example.com",
    passwordHash: "secret",
    ...overrides
  };
}

describe("patchMe", () => {
  it("updates the profile and returns the public user", async () => {
    vi.mocked(updateProfile).mockResolvedValue(userFixture() as never);
    const res = mockResponse();

    await patchMe(mockRequest({ body: { name: "Ada", email: "ada@example.com" } }), res);

    expect(updateProfile).toHaveBeenCalledWith("user-1", {
      name: "Ada",
      email: "ada@example.com"
    });
    expect(res.json).toHaveBeenCalledWith({
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});

describe("postAvatar", () => {
  it("throws a 415 when the request isn't multipart", async () => {
    await expect(
      postAvatar(mockRequest({ is: vi.fn().mockReturnValue(false) } as never), mockResponse())
    ).rejects.toThrow("Avatar upload must use multipart/form-data");
  });

  it("throws a 400 when no 'avatar' field is present", async () => {
    vi.mocked(readMultipartParts).mockResolvedValue([]);

    await expect(
      postAvatar(
        mockRequest({ is: vi.fn().mockReturnValue(true) } as never),
        mockResponse()
      )
    ).rejects.toThrow("Avatar image file is required");
  });

  it("uploads the avatar field and returns the public user", async () => {
    vi.mocked(readMultipartParts).mockResolvedValue([
      { fieldName: "avatar", filename: "a.png", contentType: "image/png", data: Buffer.from("x") }
    ]);
    vi.mocked(uploadAvatar).mockResolvedValue(userFixture() as never);
    const res = mockResponse();

    await postAvatar(
      mockRequest({ is: vi.fn().mockReturnValue(true) } as never),
      res
    );

    expect(uploadAvatar).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ fieldName: "avatar" })
    );
    expect(res.json).toHaveBeenCalledWith({
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});

describe("patchPassword", () => {
  it("updates the password and responds 204", async () => {
    vi.mocked(updatePassword).mockResolvedValue(undefined);
    const res = mockResponse();

    await patchPassword(
      mockRequest({
        body: { currentPassword: "old", newPassword: "newpassword", confirmPassword: "newpassword" }
      }),
      res
    );

    expect(updatePassword).toHaveBeenCalledWith("user-1", {
      currentPassword: "old",
      newPassword: "newpassword",
      confirmPassword: "newpassword"
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe("patchPlan", () => {
  it("updates the plan", async () => {
    vi.mocked(updatePlan).mockResolvedValue(userFixture() as never);
    const res = mockResponse();

    await patchPlan(mockRequest({ body: { planType: "flowledger_one" } }), res);

    expect(updatePlan).toHaveBeenCalledWith("user-1", { planType: "flowledger_one" });
  });
});

describe("patchSidebarSide", () => {
  it("updates the sidebar side", async () => {
    vi.mocked(updateSidebarSide).mockResolvedValue(userFixture() as never);
    const res = mockResponse();

    await patchSidebarSide(mockRequest({ body: { mobileSidebarSide: "right" } }), res);

    expect(updateSidebarSide).toHaveBeenCalledWith("user-1", {
      mobileSidebarSide: "right"
    });
  });
});
