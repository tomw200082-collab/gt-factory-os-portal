import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface Props {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: Props) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-1 flex items-center gap-1 text-xs text-fg-muted"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-fg-subtle">›</span>}
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-fg-strong"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-fg-strong">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
