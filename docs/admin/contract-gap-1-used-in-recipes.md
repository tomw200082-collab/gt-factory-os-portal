# Contract Gap #1 — GET /api/components/:id/used-in-recipes

## Status
**Closed (workaround shipped) / open as optimization.**

The portal previously capped the "Used in recipes" tab at 50 active BOM heads and showed a "Contract Gap #1" notice above that. With Tom's factory now running >50 active BOM heads, that cap made the tab non-functional in production.

The cap has been removed. `src/components/admin/UsedInRecipes.tsx` now fetches the full active-head list (`?limit=1000`, the same convention every other admin BOM page uses) and fans out per-version line queries via React Query's `useQueries`, which isolates per-version failures so one slow/failed version no longer blanks the whole tab. Partial-failure cases render whatever succeeded plus a soft warning.

This is acceptable for v1: the factory has well under 1000 active heads and each per-version fetch is small. The dedicated server-side endpoint described below remains a nice-to-have optimization (one round-trip instead of N+1) but is no longer blocking factory operations.

## Optional optimization endpoint

```
GET /api/v1/queries/components/:component_id/used-in-recipes
```

### Query parameters
| Param | Type | Default | Notes |
|---|---|---|---|
| `active_only` | boolean | `true` | When true, only returns lines from active BOM versions |

### Response shape
```json
{
  "rows": [
    {
      "bom_head_id": "BH-001",
      "item_id": "ITEM-001",
      "item_name": "Classic Margarita 1L",
      "bom_kind": "MANUFACTURED",
      "active_version_id": "uuid",
      "version_label": "v3",
      "line_id": "uuid",
      "line_no": 2,
      "final_component_qty": "0.050000",
      "component_uom": "L"
    }
  ],
  "count": 3
}
```

### SQL sketch
```sql
SELECT
  bh.bom_head_id,
  bh.parent_ref_id  AS item_id,
  bh.parent_name    AS item_name,
  bh.bom_kind,
  bh.active_version_id,
  bv.version_label,
  bl.line_id,
  bl.line_no,
  bl.final_component_qty,
  bl.component_uom
FROM bom_lines bl
JOIN bom_versions bv ON bv.bom_version_id = bl.bom_version_id
JOIN bom_heads   bh ON bh.bom_head_id    = bv.bom_head_id
WHERE bl.final_component_id = :component_id
  AND bh.active_version_id  = bv.bom_version_id  -- active_only filter
ORDER BY bh.parent_ref_id, bl.line_no;
```

## Items symmetry

The `UsedInRecipes` component accepts either `component_id` or `item_id` (discriminated union). Items are not referenced as inputs in `bom_lines.final_component_id` under the locked schema (REPACK BOMs consume a *component* as input, not an item), so the items path renders an honest empty state by design rather than fanning out. If a future schema change introduces item-as-BOM-line-input, only the items branch of `UsedInRecipes` needs to be updated.

## Portal consumer
`src/components/admin/UsedInRecipes.tsx` — the `UsedInRecipes` component.
When/if the dedicated endpoint above ships, replace the per-version fan-out with a single `useQuery` against the new URL.
