# Contract Gap #1 — GET /api/components/:id/used-in-recipes

## Status
**Open.** The portal ships a client-side fallback (fan-out over all BOM heads) capped at 50 heads. Above that limit the tab shows this gap notice and becomes non-functional.

## Why it exists
The portal needs to show which active recipes contain a given component. There is no dedicated backend query for this — only `GET /api/boms/lines?bom_version_id=<uuid>` which requires knowing the version ID first, forcing a two-step fan-out.

## Required endpoint

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

## Portal consumer
`src/components/admin/UsedInRecipes.tsx` — the `UsedInRecipes` component.
When this endpoint ships, replace the fan-out queries with a single `useQuery` against the new URL and remove the `MAX_HEADS` cap.
