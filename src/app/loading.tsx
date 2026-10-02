import { GTLoader } from "@/components/ui/GTLoader";

// A route boundary: the NavigationLoader overlay stays up until this is gone,
// so the two read as one continuous loader.
export default function Loading() {
  return <GTLoader boundary />;
}
