import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { blockUser, checkUsernameAvailability, getFieldError, listBlocks, unblockUser, updateEmail, updateProfile } from "../users.client";

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

describe("username and blocks", () => {
  it("asks for availability with the username query", async () => {
    let query = "";
    server.use(
      http.get(`${API}/users/username-availability`, ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({ username: "ana", available: true });
      })
    );
    expect((await checkUsernameAvailability("ana")).available).toBe(true);
    expect(query).toBe("?username=ana");
  });

  it("lists, creates and removes blocks", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${API}/users/blocks`, () => HttpResponse.json({ blocks: [] })),
      http.post(`${API}/users/blocks`, async ({ request }) => {
        seen.push(`POST ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({});
      }),
      http.delete(`${API}/users/blocks/u2`, () => {
        seen.push("DELETE u2");
        return new HttpResponse(null, { status: 204 });
      })
    );
    expect((await listBlocks()).blocks).toEqual([]);
    await blockUser("u2");
    await unblockUser("u2");
    expect(seen).toEqual(['POST {"userId":"u2"}', "DELETE u2"]);
  });

  it("exposes the first field-addressed error of a rejected profile update", async () => {
    server.use(
      http.patch(`${API}/users/me`, () =>
        HttpResponse.json(
          { message: "taken", issues: { fieldErrors: { username: ["Username is taken"] } } },
          { status: 409 }
        )
      )
    );
    const error = await updateProfile({ username: "ana" }).catch((caught: unknown) => caught);
    expect(getFieldError(error)).toEqual({ field: "username", message: "Username is taken" });
  });
});
