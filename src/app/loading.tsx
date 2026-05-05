// Root-level loading fallback — applies to any route segment that does not
// define its own loading.tsx. Branded full-page splash with the GT logo.

import { GtLoader } from "@/components/ui/GtLoader";

export default function RootLoading() {
  return <GtLoader.Page />;
}
