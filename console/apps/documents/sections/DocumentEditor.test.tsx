import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlEn } from "@console/i18n/testing";
import { type DocumentOut, OpsRequestError } from "@console/lib/client";
import { DocumentEditor } from "./DocumentEditor";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock("@console/lib/client", async (orig) => ({
  ...(await orig<typeof import("@console/lib/client")>()),
  ops: {
    get: (path: string) => get(path),
    post: (path: string, body: unknown) => post(path, body),
    put: (path: string, body: unknown) => put(path, body),
  },
}));

const DOC: DocumentOut = {
  slug: "roadmap-report",
  title: "Roadmap report",
  kind: "report",
  status: "draft",
  audience: "Gabriella",
  revision: 3,
  body: "# First",
  note: "Second pass",
  created_at: "2026-11-20T09:00:00Z",
  created_by: "alessio@example.com",
  updated_at: "2026-11-21T09:00:00Z",
  updated_by: "alessio@example.com",
};

function renderEditor(doc?: DocumentOut) {
  const onSaved = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <IntlEn>
      <QueryClientProvider client={client}>
        <DocumentEditor doc={doc} onSaved={onSaved} onCancel={vi.fn()} />
      </QueryClientProvider>
    </IntlEn>
  );
  return onSaved;
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  put.mockReset();
});
afterEach(cleanup);

test("a save names the revision it was opened on", async () => {
  put.mockResolvedValueOnce({ ...DOC, revision: 4, body: "# Second" });
  const onSaved = renderEditor(DOC);
  fireEvent.change(screen.getByLabelText("Text (Markdown)"), {
    target: { value: "# Second" },
  });
  fireEvent.change(screen.getByLabelText(/^What changed/), {
    target: { value: "Rewrote the intro" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(put).toHaveBeenCalledWith("documents/roadmap-report", {
    revision: 3,
    title: "Roadmap report",
    body: "# Second",
    note: "Rewrote the intro",
    kind: "report",
    audience: "Gabriella",
  });
});

test("someone saved first: the text stays, their version reloads beside it, the next save is on theirs", async () => {
  put.mockRejectedValueOnce(
    new OpsRequestError(409, "stale_document", "stale")
  );
  get.mockResolvedValueOnce({
    ...DOC,
    revision: 5,
    body: "# Theirs",
    updated_by: "andrea@example.com",
  });
  put.mockResolvedValueOnce({ ...DOC, revision: 6, body: "# Mine" });
  const onSaved = renderEditor(DOC);
  fireEvent.change(screen.getByLabelText("Text (Markdown)"), {
    target: { value: "# Mine" },
  });
  fireEvent.change(screen.getByLabelText(/^What changed/), {
    target: { value: "Mine" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(
    await screen.findByText(/Someone saved this document after you opened it/)
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Reload their version" }));
  expect(
    await screen.findByText("Their version: revision 5, by andrea@example.com")
  ).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith("documents/roadmap-report");
  expect(screen.getByLabelText("Their text")).toHaveValue("# Theirs");
  expect(screen.getByLabelText("Text (Markdown)")).toHaveValue("# Mine");

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(put.mock.calls[1][1]).toMatchObject({ revision: 5, body: "# Mine" });
});

test("a new document checks its fields first and suggests its address", async () => {
  post.mockResolvedValueOnce({ ...DOC, revision: 1 });
  const onSaved = renderEditor();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Give it a title.")).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: "Report for Andrea" },
  });
  expect(screen.getByLabelText(/^Address/)).toHaveValue("report-for-andrea");
  fireEvent.change(screen.getByLabelText(/^For/), {
    target: { value: "Andrea" },
  });
  fireEvent.change(screen.getByLabelText(/^What changed/), {
    target: { value: "First draft" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "Preview" }));
  expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(post).toHaveBeenCalledWith("documents", {
    slug: "report-for-andrea",
    title: "Report for Andrea",
    kind: "draft",
    audience: "Andrea",
    body: "",
    note: "First draft",
  });
});
