import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { updateEmail } from "../users.client";

const API = "http://localhost:4000";

describe("updateEmail", () => {
  it("PATCHes /auth/email with the email and current password", async () => {
    let body: unknown;
    server.use(
      http.patch(`${API}/auth/email`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: "new-tok", user: { id: "u1" } });
      })
    );
    const result = await updateEmail({ email: "new@example.com", currentPassword: "pw" });
    expect(body).toEqual({ email: "new@example.com", currentPassword: "pw" });
    expect(result.token).toBe("new-tok");
  });

  it("surfaces the server message on a 409", async () => {
    server.use(
      http.patch(`${API}/auth/email`, () =>
        HttpResponse.json({ message: "Email already registered" }, { status: 409 })
      )
    );
    await expect(updateEmail({ email: "x@example.com", currentPassword: "pw" })).rejects.toThrow(
      "Email already registered"
    );
  });
});
