import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ProfilePage } from "../../ProfilePage";
import { API_URL, mockBaseline } from "../../tests/profileFixtures";

function mockAvailability(taken: string[]) {
  const asked: string[] = [];
  server.use(
    http.get(`${API_URL}/users/username-availability`, ({ request }) => {
      const username = new URL(request.url).searchParams.get("username")!;
      asked.push(username);
      return HttpResponse.json({
        username,
        available: !taken.includes(username)
      });
    })
  );
  return asked;
}

async function renderProfile() {
  mockBaseline();
  renderWithProviders(<ProfilePage />, { withAuth: true, withTheme: true });
  const field = await screen.findByLabelText("Username");
  await waitFor(() => expect(field).toBeEnabled());
  return field;
}

describe("Profile identity fields", () => {
  it("shows the saved username and visibility", async () => {
    const field = await renderProfile();
    expect(field).toHaveValue("jane");
    expect(screen.getByLabelText("Identity visibility")).toHaveValue(
      "username_only"
    );
  });

  it("checks availability once after typing stops, then says available", async () => {
    const asked = mockAvailability([]);
    const field = await renderProfile();
    await userEvent.clear(field);
    await userEvent.type(field, "Jane.New");
    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(asked).toEqual(["jane.new"]);
  });

  it("flags a taken username and disables Save", async () => {
    mockAvailability(["sam"]);
    const field = await renderProfile();
    await userEvent.clear(field);
    await userEvent.type(field, "sam");
    expect(
      await screen.findByText("That username is taken")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("rejects an invalid username without asking the server", async () => {
    const asked = mockAvailability([]);
    const field = await renderProfile();
    await userEvent.clear(field);
    await userEvent.type(field, "ab");
    expect(await screen.findByText(/at least 3/i)).toBeInTheDocument();
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(asked).toEqual([]);
  });

  it("saves only the changed identity fields in the one profile update", async () => {
    mockAvailability([]);
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${API_URL}/users/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          user: {
            id: "user-1",
            name: "Jane Doe",
            email: "jane@example.com",
            username: "jane.new",
            identityVisibility: "username_and_name",
            planType: "free",
            mobileSidebarSide: "left",
            createdAt: "",
            updatedAt: ""
          }
        });
      })
    );
    const field = await renderProfile();
    await userEvent.clear(field);
    await userEvent.type(field, "jane.new");
    await userEvent.selectOptions(
      screen.getByLabelText("Identity visibility"),
      "username_and_name"
    );
    await screen.findByText("Available");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body).toMatchObject({
        username: "jane.new",
        identityVisibility: "username_and_name"
      })
    );
  });

  it("keeps the draft and marks the username field when the server answers 409", async () => {
    mockAvailability([]);
    server.use(
      http.patch(`${API_URL}/users/me`, () =>
        HttpResponse.json(
          {
            message: "Username taken",
            issues: {
              fieldErrors: { username: ["That username was just taken"] }
            }
          },
          { status: 409 }
        )
      )
    );
    const field = await renderProfile();
    await userEvent.clear(field);
    await userEvent.type(field, "racing");
    await screen.findByText("Available");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      (await screen.findAllByText("That username was just taken")).length
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Username")).toHaveValue("racing");
  });
});

it("shows public nickname helper text and validates with shared rules", async () => {
  await renderProfile();
  const nickname = screen.getByLabelText("Public nickname");
  expect(nickname).toHaveValue("");
  expect(
    screen.getByText(/Optional, not unique, visible to others and searchable/)
  ).toBeInTheDocument();
  await userEvent.type(nickname, "@jane");
  expect(
    await screen.findByText("Nickname cannot start with @")
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});
