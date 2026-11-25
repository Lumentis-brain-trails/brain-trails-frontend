"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Where a link in a document may go: the web, mail, or a heading on the same page.
 * Anything else (`javascript:`, `data:`, a relative path into the console) loses its
 * address and stays as text.
 */
export function safeHref(url: string): string | null {
  if (/^https?:\/\/\S+$/i.test(url)) return url;
  if (/^mailto:[^\s:]+@\S+$/i.test(url)) return url;
  if (/^#[\w-]+$/.test(url)) return url;
  return null;
}

const COMPONENTS: Components = {
  h1: ({ children }) => <h2 className="type-title mt-8 mb-3">{children}</h2>,
  h2: ({ children }) => <h3 className="type-heading mt-7 mb-2">{children}</h3>,
  h3: ({ children }) => (
    <h4 className="mt-6 mb-2 text-[15px] font-semibold">{children}</h4>
  ),
  h4: ({ children }) => (
    <h5 className="mt-5 mb-2 text-[14px] font-semibold text-ink-2">
      {children}
    </h5>
  ),
  h5: ({ children }) => (
    <h6 className="mt-4 mb-1 text-[14px] font-semibold text-ink-2">
      {children}
    </h6>
  ),
  h6: ({ children }) => (
    <h6 className="mt-4 mb-1 text-[13px] font-semibold text-ink-3">
      {children}
    </h6>
  ),
  p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
  ul: ({ children, className }) => (
    <ul
      className={
        className?.includes("contains-task-list")
          ? "my-3 grid gap-1"
          : "my-3 grid list-disc gap-1 pl-6"
      }
    >
      {children}
    </ul>
  ),
  ol: ({ children, start }) => (
    <ol start={start} className="my-3 grid list-decimal gap-1 pl-6">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  a: ({ children, href }) =>
    href ? (
      <a
        href={href}
        target={href.startsWith("#") ? undefined : "_blank"}
        rel="noopener noreferrer"
        className="text-accent underline underline-offset-2"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // An image would load from wherever its address points, as the reader opens the
  // page; a document shows its address as a link instead.
  img: ({ alt, src }) => {
    const href = typeof src === "string" ? safeHref(src) : null;
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline underline-offset-2"
      >
        {alt || href}
      </a>
    ) : (
      <span>{alt}</span>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-hairline-strong pl-4 text-ink-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-hairline" />,
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-[13px] leading-6">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code
      className={
        className
          ? className
          : "rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]"
      }
    >
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      style={style}
      className="border-b border-hairline-strong px-3 py-2 text-left font-semibold"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border-b border-hairline px-3 py-2">
      {children}
    </td>
  ),
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked} disabled className="mr-2" />
    ) : null,
};

/**
 * A document's Markdown, drawn (CommonMark plus GitHub's tables, task lists and
 * strikethrough). Raw HTML in the text is dropped, never rendered, and links keep only
 * the addresses `safeHref` allows, so a document can hold no markup or script.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="max-w-3xl text-[15px] text-ink wrap-anywhere">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => safeHref(url)}
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
