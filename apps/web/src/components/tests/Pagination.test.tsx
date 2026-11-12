import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "../Pagination";

describe("Pagination", () => {
  it("shows page X of Y with the total and pages with Previous/Next", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageCount={3} total={120} hasNext onPageChange={onPageChange} />);

    expect(screen.getByText("Page 2 of 3 · 120 results")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it("falls back to 'Page X' when the count is unknown and disables the ends", () => {
    render(<Pagination page={1} hasNext={false} onPageChange={() => {}} />);
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("disables both buttons while fetching", () => {
    render(<Pagination page={2} hasNext isFetching onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("offers a page-size select only when options and a handler are given", async () => {
    const onPageSizeChange = vi.fn();
    const { rerender } = render(
      <Pagination
        page={1}
        hasNext
        onPageChange={() => {}}
        pageSize={50}
        pageSizeOptions={[25, 50, 100]}
        onPageSizeChange={onPageSizeChange}
      />
    );
    await userEvent.selectOptions(screen.getByLabelText("Rows per page"), "100");
    expect(onPageSizeChange).toHaveBeenCalledWith(100);

    rerender(<Pagination page={1} hasNext onPageChange={() => {}} />);
    expect(screen.queryByLabelText("Rows per page")).not.toBeInTheDocument();
  });
});
