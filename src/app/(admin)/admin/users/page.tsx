"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";

interface AppUser {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  site_id: string | null;
  created_at: string;
  updated_at: string;
}

const ROLES = ["admin", "planner", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];

function roleTone(role: string): "accent" | "info" | "success" | "neutral" {
  if (role === "admin") return "accent";
  if (role === "planner") return "info";
  if (role === "operator") return "success";
  return "neutral";
}

interface RowState {
  roleError: string | null;
  statusError: string | null;
  rolePending: boolean;
  statusPending: boolean;
}

const DEFAULT_ROW_STATE: RowState = {
  roleError: null,
  statusError: null,
  rolePending: false,
  statusPending: false,
};

async function patchUser(
  user_id: string,
  body: { role?: string; status?: string },
): Promise<AppUser> {
  const res = await fetch(`/api/users/${encodeURIComponent(user_id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { error?: string; reason_code?: string };
  if (!res.ok) {
    if (res.status === 409 && data?.reason_code === "CANNOT_SELF_DEMOTE") {
      throw new Error("You cannot change your own admin role.");
    }
    throw new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
  }
  return data as AppUser;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { session } = useSession();
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  const getRowState = (user_id: string): RowState =>
    rowStates[user_id] ?? DEFAULT_ROW_STATE;

  const setRowField = (user_id: string, patch: Partial<RowState>) => {
    setRowStates((prev) => ({
      ...prev,
      [user_id]: { ...(prev[user_id] ?? DEFAULT_ROW_STATE), ...patch },
    }));
  };

  const { data, isLoading, error } = useQuery<{ rows: AppUser[] }>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to load users");
      return res.json() as Promise<{ rows: AppUser[] }>;
    },
  });

  const roleMutation = useMutation<AppUser, Error, { user_id: string; role: string }>({
    mutationFn: ({ user_id, role }) => patchUser(user_id, { role }),
    onMutate: ({ user_id }) => { setRowField(user_id, { rolePending: true, roleError: null }); },
    onSuccess: (_data, { user_id }) => {
      setRowField(user_id, { rolePending: false, roleError: null });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err, { user_id }) => { setRowField(user_id, { rolePending: false, roleError: err.message }); },
  });

  const statusMutation = useMutation<AppUser, Error, { user_id: string; status: string }>({
    mutationFn: ({ user_id, status }) => patchUser(user_id, { status }),
    onMutate: ({ user_id }) => { setRowField(user_id, { statusPending: true, statusError: null }); },
    onSuccess: (_data, { user_id }) => {
      setRowField(user_id, { statusPending: false, statusError: null });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err, { user_id }) => { setRowField(user_id, { statusPending: false, statusError: err.message }); },
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · users"
        title="Users"
        description="App users and role assignments. New users appear after first sign-in."
      />
      <SectionCard
        eyebrow="Users"
        title={`${data?.rows.length ?? 0} users`}
        contentClassName="p-0"
      >
        {isLoading && (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        )}
        {error && (
          <div className="p-5 text-sm text-danger-fg">
            {(error as Error).message}
          </div>
        )}
        {data && data.rows.length === 0 && (
          <div className="p-5 text-sm text-fg-muted">No users found.</div>
        )}
        {data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Name</th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Email</th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Role</th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Status</th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((u) => {
                  const rs = getRowState(u.user_id);
                  return (
                    <tr key={u.user_id} className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
                      <td className="px-3 py-2 text-fg-strong">{u.display_name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-fg-muted">{u.email}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Badge tone={roleTone(u.role)} dotted>{u.role}</Badge>
                            <select
                              className="input h-6 py-0 text-xs"
                              value={u.role}
                              disabled={rs.rolePending}
                              onChange={(e) => {
                                const newRole = e.target.value;
                                if (newRole === u.role) return;
                                roleMutation.mutate({ user_id: u.user_id, role: newRole });
                              }}
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            {rs.rolePending && (
                              <span className="text-2xs text-fg-muted">Saving…</span>
                            )}
                          </div>
                          {rs.roleError && (
                            <span className="text-2xs text-danger-fg">{rs.roleError}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">{u.status}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {u.status === "active" ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-danger-fg hover:bg-danger-softer"
                              disabled={rs.statusPending}
                              onClick={() => statusMutation.mutate({ user_id: u.user_id, status: "inactive" })}
                            >
                              {rs.statusPending ? "…" : "Deactivate"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-success-fg hover:bg-success-softer"
                              disabled={rs.statusPending}
                              onClick={() => statusMutation.mutate({ user_id: u.user_id, status: "active" })}
                            >
                              {rs.statusPending ? "…" : "Activate"}
                            </button>
                          )}
                          {rs.statusError && (
                            <span className="text-2xs text-danger-fg">{rs.statusError}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
