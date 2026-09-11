/**
 * Browser -> S3 upload through the presigned POST the API hands out
 * (`POST /recordings/uploads`). Files never pass through the BFF (Vercel caps
 * bodies at 4.5 MB); progress comes from XHR because `fetch` has none.
 */
export interface Presign {
  key: string;
  url: string;
  fields: Record<string, string>;
  max_mb: number;
}

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
        : reject(new Error(`storage upload failed (${xhr.status})`));
    xhr.onerror = () =>
      reject(new Error("network error while uploading to storage"));
    xhr.open("POST", presign.url);
    xhr.send(form);
  });
}
