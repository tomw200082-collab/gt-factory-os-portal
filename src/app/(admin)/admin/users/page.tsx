"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { useHasRole } from "@/lib/auth/role-gate";
import { usersRepo } from "@/lib/repositories";
import type { Role } from "@/lib/contracts/enums";

const ROLES: Role[] = ["operator", "planner", "admin", "viewer"];

export default function UsersAdminPage() {
  const canWrite = useHasRole("admin");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["users", query, includeInactive],
    queryFn: () => usersRepo.list({ query, includeInactive }),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      usersRepo.update(id, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const activeMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      usersRepo.setActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="System"
        title="Users"
        description="Minimal role assignment. Real invitations go through Supabase Auth — Window 5."
      />
      <SectionCard>
        <div className="mb-3">
          <SearchFilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search name or email…"
            chips={[
              {
                key: "inactive",
                label: includeInactive ? "include inactive" : "active only",
                active: includeInactive,
                onToggle: () => setIncludeInactive((v) => !v),
              },
            ]}
          />
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Display name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.display_name}</td>
                <td className="font-mono text-xs">{u.email}</td>
                <td>
                  {canWrite ? (
                    <select
                      className="input h-8"
                      value={u.role}
                      onChange={(e) =>
                        roleMut.mutate({ id: u.id, role: e.target.value as Role })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone="neutral">{u.role}</Badge>
                  )}
                </td>
                <td>
                  <Badge tone={u.active ? "success" : "neutral"}>
                    {u.active ? "active" : "inactive"}
                  </Badge>
                </td>
                <td className="text-2xs text-fg-muted">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}
                </td>
                <td>
                  {canWrite ? (
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() =>
                        activeMut.mutate({ id: u.id, active: !u.active })
                      }
                    >
                      {u.active ? "Deactivate" : "Reactivate"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </>
  );
}
