import { HttpResponse, http } from "msw";
import { server } from "../../../tests/mocks/server";
import type { User } from "../../../types/users.types";

export const API_URL = "http://localhost:4000";

export const baseUser: User = {
  id: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  planType: "free",
  mobileSidebarSide: "left",
  preferredCurrency: null,
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z"
};

const currencies = {
  currencies: [{ code: "USD", name: "US Dollar", type: "fiat" }],
  fiat: [{ code: "USD", name: "US Dollar" }],
  crypto: []
};

/** Registers msw handlers for the baseline requests every profile test needs. */
export function mockBaseline(user: User = baseUser) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/users/me`, () => HttpResponse.json({ user })),
    http.get(`${API_URL}/currencies`, () => HttpResponse.json(currencies))
  );
}
