import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("entry screen shows the name and both ways in", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { name: "Braintrails" })
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login"
  );
  expect(
    screen.getByRole("link", { name: "Create an account" })
  ).toHaveAttribute("href", "/register");
  expect(screen.getByRole("link", { name: "privacy" })).toHaveAttribute(
    "href",
    "/privacy"
  );
});
