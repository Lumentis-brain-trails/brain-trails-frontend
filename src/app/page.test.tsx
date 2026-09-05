import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("home shows the app name and version", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { name: "Brain Trails" })
  ).toBeInTheDocument();
  expect(screen.getByTestId("version")).toHaveTextContent(/version/);
});
