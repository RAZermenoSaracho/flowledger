import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "../BrandLogo";

describe("BrandLogo", () => {
  it("renders an svg with the default size class", () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-12", "w-auto");
  });

  it("accepts a custom className without dropping the default text-color classes", () => {
    const { container } = render(<BrandLogo className="h-6 w-auto" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-6", "w-auto", "text-ink");
  });

  it("forwards other svg props", () => {
    const { container } = render(<BrandLogo data-testid="brand-logo" />);
    expect(container.querySelector("svg")).toHaveAttribute("data-testid", "brand-logo");
  });
});
