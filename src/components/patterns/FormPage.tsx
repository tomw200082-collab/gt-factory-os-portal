// ---------------------------------------------------------------------------
// FormPage pattern — empty convention shell. Substrate for Tranche A.
//
// This file establishes the TYPED CONTRACT that every write-path form
// surface in the portal will adopt in later tranches. It renders a
// standard workflow frame but does NOT implement schema wiring, field
// composition, idempotency-key minting, or submit dispatch — those
// concerns live per-form.
//
// Adoption rules (enforced in later-tranche dispatches, not here):
//   - Every /stock/** operator form and every admin edit drawer over a
//     write path composes FormPage.
//   - `schema` is a zod schema (generic on purpose; the adopter types it).
//   - `submitEndpoint` is the PORTAL proxy path — not the upstream path.
//     Proxies route through src/app/api/** to the Fastify API with Bearer.
//   - `idempotent=true` REQUIRES the adopter page to mint and send an
//     Idempotency-Key header. The FormPage shell does NOT mint keys —
//     they are domain-scoped.
//   - `successRoute` is the path to push to after a committed response.
//     May be a function if the route depends on the response payload.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";

export interface FormPageProps {
  // Generic on purpose — the adopter types it to its form shape.
  schema: unknown;
  submitEndpoint: string;
  idempotent: boolean;
  successRoute: string | ((response: unknown) => string);
  children?: ReactNode;
}

export function FormPage({ children }: FormPageProps) {
  return <div>{children}</div>;
}
