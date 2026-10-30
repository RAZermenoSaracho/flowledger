import { screen } from "@testing-library/react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { routes } from "../../../constants/routes";

function Probe() {
  const { pathname, search } = useLocation();
  return <p>{`${pathname}${search}`}</p>;
}

describe("legacy developer route", () => {
  it("redirects to the Security tab of the profile", () => {
    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<Probe />} />
        <Route path={routes.developer} element={<Navigate to="/profile?tab=security" replace />} />
      </Routes>,
      { route: routes.developer }
    );
    expect(screen.getByText("/profile?tab=security")).toBeInTheDocument();
  });
});
