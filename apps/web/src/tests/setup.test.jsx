
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

function TestGreeting() {
  return <h1>School ERP is ready</h1>;
}

describe("Frontend testing setup", () => {
  it("renders a heading successfully", () => {
    render(<TestGreeting />);

    expect(
      screen.getByRole("heading", { name: "School ERP is ready" }),
    ).toBeInTheDocument();
  });
});
