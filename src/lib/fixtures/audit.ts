import type { AuditMeta } from "@/lib/contracts/dto";

export function seedAudit(created_by = "seed"): AuditMeta {
  const now = new Date().toISOString();
  return {
    created_at: now,
    created_by,
    updated_at: now,
    updated_by: created_by,
    version: 1,
    active: true,
  };
}

export function bumpAudit(prev: AuditMeta, by = "seed"): AuditMeta {
  return {
    ...prev,
    updated_at: new Date().toISOString(),
    updated_by: by,
    version: prev.version + 1,
  };
}
