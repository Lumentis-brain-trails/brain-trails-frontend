import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("home shows the app name, version and entry links", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { name: "Brain Trails" })
  ).toBeInTheDocument();
  expect(screen.getByTestId("version")).toHaveTextContent(/prototype/);
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login"
  );
  expect(
    screen.getByRole("link", { name: "Create an account" })
  ).toHaveAttribute("href", "/register");
});
