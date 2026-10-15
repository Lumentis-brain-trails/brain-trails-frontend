/**
 * Browser -> S3 upload through the presigned POST the API hands out
 * (`POST /recordings/uploads`). Files never pass through the BFF (Vercel caps
 * bodies at 4.5 MB); progress comes from XHR because `fetch` has none.
 */
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { ApiRequestError } from "@/lib/api";
import { useErrorMessage } from "@/lib/errorMessage";

export interface Presign {
  key: string;
  url: string;
  fields: Record<string, string>;
  max_mb: number;
}

/**
 * What `POST /recordings/uploads` returns for a browser session: the form for
 * the EEG file plus one per sidecar asked for. The raw capture has its own,
 * larger cap (`max_ble_mb`, backend decision V2-0006).
 */
export interface SessionPresign extends Presign {
  max_ble_mb: number;
  extras: Presign | null;
  ble: Presign | null;
}

/** Why an upload to storage failed: storage refused it, or it never got there. */
export type UploadErrorCode = "storage_failed" | "network";

/**
 * A failed upload, with a stable `code` for the UI to translate
 * (`recordings.upload.errors.<code>`) and storage's HTTP `status` when it answered.
 * `message` stays the English sentence it always was, for logs and for callers that
 * still show it as is.
 */
export class UploadError extends Error {
  constructor(
    public code: UploadErrorCode,
    message: string,
    public status: number | null = null
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * POST `file` to storage through `presign`, reporting progress as a whole percentage.
 * Rejects with an `UploadError`: `storage_failed` on a non-2xx answer, `network` when
 * the request itself failed.
 */
export function uploadToStorage(
  presign: Presign,
  file: Blob,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    Object.entries(presign.fields).forEach(([k, v]) => form.append(k, v));
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300
        ? resolve()
        : reject(
            new UploadError(
              "storage_failed",
              `storage upload failed (${xhr.status})`,
              xhr.status
            )
          );
    xhr.onerror = () =>
      reject(
        new UploadError("network", "network error while uploading to storage")
      );
    xhr.open("POST", presign.url);
    xhr.send(form);
  });
}

/**
 * `const describe = useUploadErrorMessage(); describe(error)` in an upload dialog: the
 * sentence for whatever its mutation threw.
 *
 * An `UploadError` is translated by its code, an API or network failure goes through
 * `useErrorMessage` (the code's translation, else the server's message), and any other
 * `Error` is a sentence the dialog itself threw, already in the reader's language, so
 * it is shown as it is.
 */
export function useUploadErrorMessage(): (error: unknown) => string {
  const t = useTranslations("recordings.upload.errors");
  const apiMessage = useErrorMessage();
  return useCallback(
    (error: unknown) => {
      if (error instanceof UploadError)
        return error.code === "network"
          ? t("network")
          : t("storage_failed", { status: String(error.status ?? "") });
      if (
        error instanceof Error &&
        error.message &&
        !(error instanceof ApiRequestError) &&
        !(error instanceof TypeError)
      )
        return error.message;
      return apiMessage(error);
    },
    [apiMessage, t]
  );
}
