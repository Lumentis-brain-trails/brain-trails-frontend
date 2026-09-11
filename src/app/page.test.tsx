import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("landing shows the headline and entry links", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { name: /watch where your brain travelled/i })
  ).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute(
    "href",
    "/login"
  );
  expect(
    screen.getAllByRole("link", { name: "Create an account" })[0]
  ).toHaveAttribute("href", "/register");
  expect(screen.getByRole("link", { name: "privacy" })).toHaveAttribute(
    "href",
    "/privacy"
  );
});
