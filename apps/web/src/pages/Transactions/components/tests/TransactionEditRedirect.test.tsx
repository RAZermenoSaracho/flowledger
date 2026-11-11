import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TransactionEditRedirect } from "../TransactionEditRedirect";

describe("TransactionEditRedirect", () => {
  it("redirects /transactions/:id/edit to /transactions/:id", () => {
    render(
      <MemoryRouter initialEntries={["/transactions/abc/edit"]}>
        <Routes>
          <Route path="/transactions/:id/edit" element={<TransactionEditRedirect />} />
          <Route path="/transactions/:id" element={<div>Transaction view</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Transaction view")).toBeInTheDocument();
  });
});
