import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * The console is a second Next.js app in the product's repository (backend plan OPS,
 * OPS-0002), an npm workspace of it. It imports the product's design tokens and `ui`
 * primitives from `../src` - one source, not a copy - so the build's root is the
 * repository, and the workspace keeps a single React and a single next-intl for both.
 */
const root = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
  poweredByHeader: false,
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
