"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { useSession } from "@/lib/auth/session-provider";

// ---------------------------------------------------------------------------
// Upstream user row shape from GET /api/v1/queries/users
// and PATCH /api/v1/mutations/admin/users/:user_id
// ---------------------------------------------------------------------------
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

const ROLE_COLORS: Record<string, string> = {
  admin: "text-purple-700",
  planner: "text-blue-700",
  operator: "text-green-700",
  viewer: "text-muted-foreground",
};

// Per-row mutation state — tracks loading/error for role and status independently.
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
  const data = await res.json();
  if (!res.ok) {
    // Surface self-demote 409 with a clear message.
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

  // Per-row error / loading state keyed by user_id.
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  const getRowState = (user_id: string): RowState =>
    rowStates[user_id] ?? DEFAULT_ROW_STATE;

  const setRowField = (
    user_id: string,
    patch: Partial<RowState>,
  ) => {
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
      return res.json();
    },
  });

  // Role mutation — per-row via manual fetch to carry user_id in the loop.
  const roleMutation = useMutation<
    AppUser,
    Error,
    { user_id: string; role: string }
  >({
    mutationFn: ({ user_id, role }) => patchUser(user_id, { role }),
    onMutate: ({ user_id }) => {
      setRowField(user_id, { rolePending: true, roleError: null });
    },
    onSuccess: (_data, { user_id }) => {
      setRowField(user_id, { rolePending: false, roleError: null });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err, { user_id }) => {
      setRowField(user_id, { rolePending: false, roleError: err.message });
    },
  });

  // Status mutation.
  const statusMutation = useMutation<
    AppUser,
    Error,
    { user_id: string; status: string }
  >({
    mutationFn: ({ user_id, status }) => patchUser(user_id, { status }),
    onMutate: ({ user_id }) => {
      setRowField(user_id, { statusPending: true, statusError: null });
    },
    onSuccess: (_data, { user_id }) => {
      setRowField(user_id, { statusPending: false, statusError: null });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err, { user_id }) => {
      setRowField(user_id, { statusPending: false, statusError: err.message });
    },
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin"
        title="Users"
        description="App users and role assignments."
      />
      <SectionCard eyebrow="Users" title="Active Users">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            Error loading users. Check /api/users proxy exists.
          </p>
        )}
        {data && data.rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No users found.</p>
        )}
        {data && data.rows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Role</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u) => {
                const rs = getRowState(u.user_id);
                const isSelf = session.user_id !== "" && session.user_id === u.user_id;
                return (
                  <tr key={u.user_id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{u.display_name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{u.email}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-col gap-1">
                        <select
                          className={`rounded border border-border bg-background px-2 py-1 text-xs font-medium ${ROLE_COLORS[u.role] ?? ""} disabled:opacity-50`}
                          value={u.role}
                          disabled={rs.rolePending}
                          onChange={(e) => {
                            const newRole = e.target.value;
                            if (newRole === u.role) return;
                            roleMutation.mutate({ user_id: u.user_id, role: newRole });
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        {rs.rolePending && (
                          <span className="text-2xs text-muted-foreground">
                            Saving…
                          </span>
                        )}
                        {rs.roleError && (
                          <span className="text-2xs text-destructive">
                            {isSelf && rs.roleError.includes("own admin")
                              ? rs.roleError
                              : rs.roleError}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted-foreground">
                      {u.status}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        {u.status === "active" ? (
                          <button
                            className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            disabled={rs.statusPending}
                            onClick={() =>
                              statusMutation.mutate({
                                user_id: u.user_id,
                                status: "inactive",
                              })
                            }
                          >
                            {rs.statusPending ? "…" : "Deactivate"}
                          </button>
                        ) : (
                          <button
                            className="rounded border border-border px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50"
                            disabled={rs.statusPending}
                            onClick={() =>
                              statusMutation.mutate({
                                user_id: u.user_id,
                                status: "active",
                              })
                            }
                          >
                            {rs.statusPending ? "…" : "Activate"}
                          </button>
                        )}
                        {rs.statusError && (
                          <span className="text-2xs text-destructive">
                            {rs.statusError}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          New users appear here automatically after their first sign-in. Contact
          your system administrator to provision access.
        </p>
      </SectionCard>
    </>
  );
}
