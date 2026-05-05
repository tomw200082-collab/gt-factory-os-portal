// (auth) Auth pages (sign-in, magic link) loading fallback — full-page splash.
// Auth flows have no chrome around them, so the page-level splash is right.

import { GtLoader } from "@/components/ui/GtLoader";

export default function AuthGroupLoading() {
  return <GtLoader.Page label="מאמת זהות" />;
}
