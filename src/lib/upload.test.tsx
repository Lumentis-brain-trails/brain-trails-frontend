import { renderHook } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { afterEach, describe, expect, test, vi } from "vitest";
import messages from "../../messages/en.json";
import { IntlEn } from "@/i18n/testing";
import { ApiRequestError } from "./api";
import { TASK_LABELS, taskName } from "./types";
import {
  UploadError,
  uploadToStorage,
  useUploadErrorMessage,
  type Presign,
} from "./upload";

const presign: Presign = {
  key: "uploads-pending/ws/file.csv",
  url: "https://storage.test/bucket",
  fields: { policy: "p" },
  max_mb: 50,
};

/** An XHR that answers `status` (or fails outright) as soon as it is sent. */
function stubXhr(outcome: { status: number } | "network") {
  class FakeXhr {
    status = 0;
    upload: { onprogress?: (e: ProgressEvent) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    open = vi.fn();
    send() {
      this.upload.onprogress?.({
        lengthComputable: true,
        loaded: 1,
        total: 2,
      } as ProgressEvent);
      if (outcome === "network") this.onerror?.();
      else {
        this.status = outcome.status;
        this.onload?.();
      }
    }
  }
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

afterEach(() => vi.unstubAllGlobals());

describe("uploadToStorage", () => {
  test("resolves on a 2xx and reports progress as a percentage", async () => {
    stubXhr({ status: 204 });
    const progress = vi.fn();
    await uploadToStorage(presign, new Blob(["x"]), progress);
    expect(progress).toHaveBeenCalledWith(50);
  });

  test("a refusal from storage carries its code and status", async () => {
    stubXhr({ status: 403 });
    const error = await uploadToStorage(
      presign,
      new Blob(["x"]),
      () => {}
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect(error).toMatchObject({
      code: "storage_failed",
      status: 403,
      message: "storage upload failed (403)",
    });
  });

  test("a request that never arrived is a network error", async () => {
    stubXhr("network");
    await expect(
      uploadToStorage(presign, new Blob(["x"]), () => {})
    ).rejects.toMatchObject({ code: "network", status: null });
  });
});

describe("useUploadErrorMessage", () => {
  const describeError = () =>
    renderHook(() => useUploadErrorMessage(), { wrapper: IntlEn }).result
      .current;

  test("an upload error is translated by its code", () => {
    const describe_ = describeError();
    expect(describe_(new UploadError("storage_failed", "raw", 403))).toBe(
      "storage upload failed (403)"
    );
    expect(describe_(new UploadError("network", "raw"))).toBe(
      messages.recordings.upload.errors.network
    );
  });

  test("an API error keeps the server's message when its code has no key", () => {
    const error = new ApiRequestError(422, {
      code: "bad_file",
      message: "not a Muse file",
    });
    expect(describeError()(error)).toBe("not a Muse file");
  });

  test("a sentence the dialog threw is shown as it is", () => {
    expect(describeError()(new Error("Give the recording a title."))).toBe(
      "Give the recording a title."
    );
  });

  test("anything else falls back to the generic sentences", () => {
    const describe_ = describeError();
    expect(describe_(new TypeError("Failed to fetch"))).toBe(
      messages.errors.network
    );
    expect(describe_("boom")).toBe(messages.errors.unknown);
  });
});

describe("taskName", () => {
  const t = createTranslator({
    locale: "en",
    messages,
    namespace: "recordings",
  }) as unknown as Parameters<typeof taskName>[0];

  test("every task label on offer has a name in the catalogue", () => {
    for (const label of TASK_LABELS)
      expect(taskName(t, label)).toBe(messages.recordings.tasks[label]);
  });

  test("the English names are the labels with spaces, as they always were", () => {
    for (const label of TASK_LABELS)
      expect(taskName(t, label)).toBe(label.replaceAll("_", " "));
  });

  test("an unknown label is shown with its underscores as spaces", () => {
    expect(taskName(t, "signal_navigator")).toBe("signal navigator");
  });
});
