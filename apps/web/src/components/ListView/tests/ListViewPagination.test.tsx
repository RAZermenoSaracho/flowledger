import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ListPagerState } from "../../../types/common.types";
import { ListViewPagination } from "../ListViewPagination";

function setup(props: Partial<ListPagerState> = {}) {
  const onRangeChange = vi.fn();
  const state: ListPagerState = {
    offset: 40, limit: 40, total: 312, hasNext: true, isFetching: false, onRangeChange, ...props
  };
  render(<ListViewPagination {...state} />);
  return { onRangeChange, user: userEvent.setup() };
}

async function openInput(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /edit range/ }));
  return screen.getByRole("textbox", { name: "Record range" });
}

describe("ListViewPagination", () => {
  it("shows the range, clamped at the end, and the aria label", () => {
    setup();
    expect(screen.getByText("41-80 / 312")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Records 41 to 80 of 312, edit range" })).toBeInTheDocument();
  });

  it("clamps the end to the total", () => {
    setup({ offset: 300, limit: 50 });
    expect(screen.getByText("301-312 / 312")).toBeInTheDocument();
  });

  it("omits the total when unknown and hides at total 0", () => {
    const a = render(
      <ListViewPagination offset={0} limit={20} total={null} hasNext isFetching={false} onRangeChange={() => {}} />
    );
    expect(screen.getByText("1-20")).toBeInTheDocument();
    a.unmount();
    render(<ListViewPagination offset={0} limit={20} total={0} hasNext={false} isFetching={false} onRangeChange={() => {}} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("opens a prefilled input by click, Enter and Space", async () => {
    const { user } = setup();
    expect(await openInput(user)).toHaveValue("41-80");
    await user.keyboard("{Escape}");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox")).toHaveValue("41-80");
    await user.keyboard("{Escape}");
    await user.keyboard(" ");
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it.each(["7-26", " 7 – 26 "])("applies %j as offset 6 limit 20", async (text) => {
    const { user, onRangeChange } = setup();
    const input = await openInput(user);
    await user.clear(input);
    await user.type(input, `${text}{Enter}`);
    expect(onRangeChange).toHaveBeenCalledWith(6, 20);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it.each(["40-1", "-5-10", "0-10", "abc", "7", "1.5-9", "1-501", "400-450"])(
    "rejects %j",
    async (text) => {
      const { user, onRangeChange } = setup();
      const input = await openInput(user);
      await user.clear(input);
      await user.type(input, `${text}{Enter}`);
      expect(onRangeChange).not.toHaveBeenCalled();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Enter a range like 1-40")).toHaveAttribute("id", input.getAttribute("aria-describedby"));
    }
  );

  it("accepts an end beyond the total", async () => {
    const { user, onRangeChange } = setup();
    const input = await openInput(user);
    await user.clear(input);
    await user.type(input, "301-400{Enter}");
    expect(onRangeChange).toHaveBeenCalledWith(300, 100);
  });

  it("restores on Escape and on blur without applying", async () => {
    const { user, onRangeChange } = setup();
    let input = await openInput(user);
    await user.clear(input);
    await user.type(input, "7-26{Escape}");
    expect(screen.getByText("41-80 / 312")).toBeInTheDocument();
    input = await openInput(user);
    await user.clear(input);
    await user.type(input, "7-26");
    await user.tab();
    expect(screen.getByText("41-80 / 312")).toBeInTheDocument();
    expect(onRangeChange).not.toHaveBeenCalled();
  });

  it("moves by the window size from a nonstandard start", async () => {
    const { user, onRangeChange } = setup({ offset: 6, limit: 20 });
    await user.click(screen.getByRole("button", { name: "Next records" }));
    expect(onRangeChange).toHaveBeenLastCalledWith(26, 20);
    await user.click(screen.getByRole("button", { name: "Previous records" }));
    expect(onRangeChange).toHaveBeenLastCalledWith(0, 20);
  });

  it("disables Previous at the start, Next at the end and both while fetching", () => {
    const a = render(<ListViewPagination offset={0} limit={50} total={312} hasNext isFetching={false} onRangeChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous records" })).toBeDisabled();
    a.unmount();
    const b = render(<ListViewPagination offset={300} limit={50} total={312} hasNext={false} isFetching={false} onRangeChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Next records" })).toBeDisabled();
    b.unmount();
    render(<ListViewPagination offset={50} limit={50} total={312} hasNext isFetching onRangeChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Next records" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous records" })).toBeDisabled();
  });

  it("has 44px targets, a polite live range and a full-width mobile row", () => {
    setup();
    expect(screen.getByRole("button", { name: "Next records" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByText("41-80 / 312")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("navigation")).toHaveClass("w-full");
  });
});
