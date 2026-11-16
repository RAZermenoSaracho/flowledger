import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formatValuationTime } from "../../../../utils/dateTime";
import { ValuationTime } from "../ValuationTime";

const ISO = "2026-11-01T15:30:00.000Z";
const text = `Last updated: ${formatValuationTime(ISO)}`;

describe("ValuationTime", () => {
  it("describes the price button with a tooltip that is hidden until opened", () => {
    render(<ValuationTime valuedAt={ISO}>$60,000.00</ValuationTime>);
    const trigger = screen.getByRole("button", { name: "$60,000.00" });
    expect(trigger).toHaveAccessibleDescription(text);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus, closes on blur", async () => {
    const user = userEvent.setup();
    render(<ValuationTime valuedAt={ISO}>$60,000.00</ValuationTime>);
    await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent(text);
    await user.tab();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on tap and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ValuationTime valuedAt={ISO}>$60,000.00</ValuationTime>);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toHaveTextContent(text);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes on an outside tap", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <p>outside</p>
        <ValuationTime valuedAt={ISO}>$60,000.00</ValuationTime>
      </div>
    );
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows a secondary text line in the label variant", () => {
    render(
      <ValuationTime valuedAt={ISO} variant="label">
        $60,000.00
      </ValuationTime>
    );
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders no timestamp and no trigger without valuedAt", () => {
    render(<ValuationTime valuedAt={null}>1 USD</ValuationTime>);
    expect(screen.getByText("1 USD")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });
});
