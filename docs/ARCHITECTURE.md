# Frontend architecture

- **App Router** with route groups: `(public)` login/register/verify/pending,
  `(app)` authenticated area, `(admin)` admin-only pages.
- **BFF pattern**: the browser only talks to same-origin `/api/*` route handlers.
  `/api/backend/[...path]` forwards allow-listed paths (`auth/`, `recordings`,
  `admin/`) to `API_URL`, attaching the JWT from the `bt_token` httpOnly cookie -
  the token never reaches browser JS. `/api/auth/login` sets the cookie;
  `/api/auth/logout` clears it. `src/middleware.ts` redirects cookie-less visits
  to protected routes.
- **Forms**: react-hook-form + zod (`src/lib/schemas.ts` mirrors backend
  contracts); multi-step registration (account -> demographics -> consent).
- **Data**: TanStack Query provider in `src/app/providers.tsx`.
- **UI**: minimal Tailwind primitives in `src/components/ui.tsx` (shadcn/ui
  deferred until the design settles).
