import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GoogleIcon } from "../GoogleIcon";

describe("GoogleIcon", () => {
  it("renders an svg with the default size class", () => {
    const { container } = render(<GoogleIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-5", "w-5");
  });

  it("accepts a custom className", () => {
    const { container } = render(<GoogleIcon className="h-8 w-8" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-8", "w-8");
  });

  it("is hidden from assistive technology", () => {
    const { container } = render(<GoogleIcon />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
