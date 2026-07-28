"use client";

// ---------------------------------------------------------------------------
// Admin · Users — settings-pages redesign iters 7-11.
//
//   7. Audit: users table — email, display_name, role (select), status.
//   8. Role badges: admin=danger, planner=info, operator=neutral, viewer=neutral.
//   9. Status column: dot-badge — active=success, inactive=neutral.
//  10. "You" chip next to own name; own role select disabled (non-destructive).
//  11. Empty state with Supabase invite guidance.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { QueryCountChip } from "@/components/feedback/QueryCountChip";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import { useSession } from "@/lib/auth/session-provider";
import { Users, X, Eye, EyeOff, Copy, KeyRound } from "lucide-react";
import { cn } from "@/lib/cn";

interface AppUser {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  site_id: string | null;
  created_at: string;
  updated_at: string;
  has_password: boolean;
}

const ROLES = ["admin", "planner", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// Iter 8 — Role badge tones.
// admin = danger  (rare, highest privilege).
// planner = info  (intermediate, data-affecting).
// operator = neutral (primary daily user).
// viewer = neutral muted.
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: string }): JSX.Element {
  if (role === "admin") {
    return (
      <Badge tone="danger" dotted>
        admin
      </Badge>
    );
  }
  if (role === "planner") {
    return (
      <Badge tone="info" dotted>
        planner
      </Badge>
    );
  }
  if (role === "operator") {
    return (
      <Badge tone="neutral" dotted>
        operator
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      {role}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Iter 9 — Status dot-badge.
// ---------------------------------------------------------------------------

function StatusBadgeDot({ status }: { status: string }): JSX.Element {
  if (status === "active") {
    return (
      <Badge tone="success" dotted>
        active
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      {status}
    </Badge>
  );
}

interface RowState {
  roleError: string | null;
  statusError: string | null;
  rolePending: boolean;
  statusPending: boolean;
  passwordError: string | null;
  passwordPending: boolean;
  // Plaintext, held only in memory for this row until the admin hides it or
  // navigates away — never persisted client-side, never included in the
  // users list payload.
  revealedPassword: string | null;
}

const DEFAULT_ROW_STATE: RowState = {
  roleError: null,
  statusError: null,
  rolePending: false,
  statusPending: false,
  passwordError: null,
  passwordPending: false,
  revealedPassword: null,
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
  const data = (await res.json()) as { error?: string; reason_code?: string };
  if (!res.ok) {
    if (res.status === 409 && data?.reason_code === "CANNOT_SELF_DEMOTE") {
      throw new Error("You cannot change your own admin role.");
    }
    throw new Error(
      data?.error ??
        "Could not update user. Check your connection and try again.",
    );
  }
  return data as AppUser;
}

interface PasswordOpResponse {
  user_id: string;
  password: string;
}

async function setUserPassword(user_id: string): Promise<PasswordOpResponse> {
  const res = await fetch(`/api/users/${encodeURIComponent(user_id)}/password`, {
    method: "POST",
  });
  const data = (await res.json()) as PasswordOpResponse & { detail?: string; error?: string };
  if (!res.ok) {
    throw new Error(
      data?.detail ?? data?.error ??
        "Could not set a new password. Check your connection and try again.",
    );
  }
  return data;
}

async function revealUserPassword(user_id: string): Promise<PasswordOpResponse> {
  const res = await fetch(`/api/users/${encodeURIComponent(user_id)}/password`);
  const data = (await res.json()) as PasswordOpResponse & { detail?: string; error?: string };
  if (!res.ok) {
    throw new Error(
      data?.detail ?? data?.error ??
        "Could not load the password. Try generating a new one.",
    );
  }
  return data;
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin:
    "Full access including user management, masters, and system config. Assign sparingly.",
  planner:
    "Can create and approve purchase recommendations, manage forecast, and review stock. Cannot change system config.",
  operator:
    "Can submit daily forms (Goods Receipt, Production Actual, Physical Count). Read access to stock and orders.",
  viewer:
    "Read-only access to dashboard and stock. Cannot submit forms or create records.",
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { session } = useSession();
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  // Default to active-only; deactivated rows are rare and admin-curiosity only.
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const getRowState = (user_id: string): RowState =>
    rowStates[user_id] ?? DEFAULT_ROW_STATE;

  const setRowField = (user_id: string, patch: Partial<RowState>) => {
    setRowStates((prev) => ({
      ...prev,
      [user_id]: { ...(prev[user_id] ?? DEFAULT_ROW_STATE), ...patch },
    }));
  };

  const { data, isLoading, error, refetch } = useQuery<{ rows: AppUser[] }>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok)
        throw new Error(
          "We couldn't load users. Check your connection and try again.",
        );
      return res.json() as Promise<{ rows: AppUser[] }>;
    },
  });

  const roleMutation = useMutation<
    AppUser,
    Error,
    { user_id: string; role: string }
  >({
    mutationFn: ({ user_id, role }) => patchUser(user_id, { role }),
    onMutate: ({ user_id }) => {
      setRowField(user_id, { rolePending: true, roleError: null });
    },
    onSuccess: (_data, { user_id, role }) => {
      setRowField(user_id, { rolePending: false, roleError: null });
      setBanner({ kind: "success", message: `Role updated to "${role}".` });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err, { user_id }) => {
      setRowField(user_id, { rolePending: false, roleError: err.message });
      setBanner({ kind: "error", message: err.message });
    },
  });

  const statusMutation = useMutation<
    AppUser,
    Error,
    { user_id: string; status: string }
  >({
    mutationFn: ({ user_id, status }) => patchUser(user_id, { status }),
    onMutate: ({ user_id }) => {
      setRowField(user_id, { statusPending: true, statusError: null });
    },
    onSuccess: (_data, { user_id, status }) => {
      setRowField(user_id, { statusPending: false, statusError: null });
      setBanner({
        kind: "success",
        message: `User ${status === "active" ? "activated" : "deactivated"}.`,
      });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err, { user_id }) => {
      setRowField(user_id, { statusPending: false, statusError: err.message });
      setBanner({ kind: "error", message: err.message });
    },
  });

  const setPasswordMutation = useMutation<
    PasswordOpResponse,
    Error,
    { user_id: string }
  >({
    mutationFn: ({ user_id }) => setUserPassword(user_id),
    onMutate: ({ user_id }) => {
      setRowField(user_id, { passwordPending: true, passwordError: null });
    },
    onSuccess: (data, { user_id }) => {
      setRowField(user_id, {
        passwordPending: false,
        passwordError: null,
        revealedPassword: data.password,
      });
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err, { user_id }) => {
      setRowField(user_id, { passwordPending: false, passwordError: err.message });
    },
  });

  const revealPasswordMutation = useMutation<
    PasswordOpResponse,
    Error,
    { user_id: string }
  >({
    mutationFn: ({ user_id }) => revealUserPassword(user_id),
    onMutate: ({ user_id }) => {
      setRowField(user_id, { passwordPending: true, passwordError: null });
    },
    onSuccess: (data, { user_id }) => {
      setRowField(user_id, {
        passwordPending: false,
        passwordError: null,
        revealedPassword: data.password,
      });
    },
    onError: (err, { user_id }) => {
      setRowField(user_id, { passwordPending: false, passwordError: err.message });
    },
  });

  const currentUserId: string =
    (session as { user_id?: string }).user_id ?? "";

  const allRows = data?.rows ?? [];
  const visibleRows = showInactive
    ? allRows
    : allRows.filter((u) => u.status === "active");
  const inactiveCount = allRows.length - allRows.filter((u) => u.status === "active").length;

  return (
    <>
      {confirmDialog}
      <WorkflowHeader
        eyebrow="Admin · users"
        title="Users"
        description="App users and role assignments. New users appear automatically after their first sign-in via Supabase magic-link."
        meta={
          <>
            <QueryCountChip
              isLoading={isLoading}
              isError={Boolean(error)}
              count={isLoading ? undefined : visibleRows.length}
              noun="users"
            />
          </>
        }
      />

      {banner ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={
            banner.kind === "success"
              ? "rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          <div className="flex items-center justify-between gap-3">
            <span>{banner.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 text-current opacity-60 hover:opacity-100"
              onClick={() => setBanner(null)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Role reference"
        title="Roles"
        density="compact"
        description="Each role controls what a user can see and do inside the portal."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((role) => (
            <div
              key={role}
              className="flex items-start gap-2.5 rounded border border-border/60 bg-bg-subtle/30 p-3"
            >
              <span className="mt-0.5 shrink-0">
                <RoleBadge role={role} />
              </span>
              <p className="text-xs leading-relaxed text-fg-muted">
                {ROLE_DESCRIPTIONS[role]}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Users"
        title={`${visibleRows.length} ${showInactive ? "users" : "active users"}`}
        description={
          inactiveCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="text-xs font-medium text-accent underline hover:no-underline"
            >
              {showInactive
                ? `Hide ${inactiveCount} inactive`
                : `Show ${inactiveCount} inactive`}
            </button>
          ) : undefined
        }
        contentClassName="p-0"
      >
        {isLoading && (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load users</div>
              <div className="mt-1 text-xs">{(error as Error).message}</div>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {data && visibleRows.length === 0 && (
          <div className="p-8 text-center">
            <div className="mx-auto max-w-sm">
              <Users
                className="mx-auto mb-3 h-8 w-8 text-fg-faint"
                strokeWidth={1.5}
              />
              <div className="text-sm font-semibold text-fg-strong">
                No users yet
              </div>
              <div className="mt-2 text-xs leading-relaxed text-fg-muted">
                Users appear automatically the first time they sign in via
                Supabase magic-link. To invite someone, share the portal URL and
                have them request access — or add them directly in the{" "}
                <span className="font-medium text-fg">
                  Supabase Authentication dashboard
                </span>
                .
              </div>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm mt-3"
              >
                Open Supabase dashboard
              </a>
            </div>
          </div>
        )}

        {data && visibleRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Email
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Password
                  </th>
                  <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((u) => {
                  const rs = getRowState(u.user_id);
                  const isSelf = u.user_id === currentUserId;

                  return (
                    <tr
                      key={u.user_id}
                      className={cn(
                        "border-b border-border/40 last:border-b-0",
                        isSelf
                          ? "bg-accent/5 hover:bg-accent/10"
                          : "hover:bg-bg-subtle/40",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-fg-strong">
                            {u.display_name}
                          </span>
                          {isSelf ? (
                            <span className="inline-flex items-center rounded-sm border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-accent">
                              You
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                        {u.email}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <RoleBadge role={u.role} />
                            {isSelf ? (
                              <span
                                className="text-2xs text-fg-faint"
                                title="You cannot change your own role"
                              >
                                (locked)
                              </span>
                            ) : (
                              <select
                                className="input h-6 py-0 text-xs"
                                value={u.role}
                                disabled={rs.rolePending}
                                aria-label={`Change role for ${u.display_name}`}
                                onChange={async (e) => {
                                  const newRole = e.target.value;
                                  if (newRole === u.role) return;
                                  const ok = await confirm({
                                    title: `Change ${u.display_name}'s role to "${newRole}"?`,
                                    description:
                                      "This updates their portal access immediately.",
                                    confirmLabel: "Change role",
                                    tone: "danger",
                                  });
                                  // The select is controlled by value={u.role};
                                  // on cancel it re-asserts the original role.
                                  if (!ok) return;
                                  roleMutation.mutate({
                                    user_id: u.user_id,
                                    role: newRole,
                                  });
                                }}
                              >
                                {ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            )}
                            {rs.rolePending && (
                              <span className="text-2xs text-fg-muted">
                                Saving…
                              </span>
                            )}
                          </div>
                          {rs.roleError && (
                            <span className="text-2xs text-danger-fg">
                              {rs.roleError}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadgeDot status={u.status} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-start gap-1">
                          {rs.revealedPassword ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="font-mono text-xs text-fg-strong"
                                data-testid={`password-value-${u.user_id}`}
                              >
                                {rs.revealedPassword}
                              </span>
                              <button
                                type="button"
                                aria-label={`Copy password for ${u.display_name}`}
                                className="btn btn-ghost btn-sm"
                                onClick={() => {
                                  void navigator.clipboard.writeText(rs.revealedPassword!);
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Hide password for ${u.display_name}`}
                                className="btn btn-ghost btn-sm"
                                onClick={() => setRowField(u.user_id, { revealedPassword: null })}
                              >
                                <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                              </button>
                            </div>
                          ) : u.has_password ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm w-fit"
                              disabled={rs.passwordPending}
                              aria-label={`Show password for ${u.display_name}`}
                              onClick={() => revealPasswordMutation.mutate({ user_id: u.user_id })}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
                              {rs.passwordPending ? "…" : "••••••••"}
                            </button>
                          ) : (
                            <span className="text-2xs text-fg-faint">No password set</span>
                          )}
                          <button
                            type="button"
                            className="w-fit text-2xs text-accent underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
                            disabled={rs.passwordPending}
                            onClick={async () => {
                              const ok = await confirm({
                                title: u.has_password
                                  ? `Reset ${u.display_name}'s password?`
                                  : `Set a password for ${u.display_name}?`,
                                description: u.has_password
                                  ? "Generates a brand-new password and immediately replaces their current one — their old password stops working right away."
                                  : "Generates a new sign-in password they can use immediately, alongside the magic-link.",
                                confirmLabel: u.has_password ? "Reset password" : "Set password",
                                tone: u.has_password ? "danger" : undefined,
                              });
                              if (!ok) return;
                              setPasswordMutation.mutate({ user_id: u.user_id });
                            }}
                          >
                            <KeyRound className="mr-1 inline h-3 w-3" strokeWidth={2} />
                            {rs.passwordPending ? "…" : u.has_password ? "Regenerate" : "Generate"}
                          </button>
                          {rs.passwordError && (
                            <span className="text-2xs text-danger-fg">{rs.passwordError}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-col items-end gap-1">
                          {u.status === "active" ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-danger-fg hover:bg-danger-softer"
                              disabled={rs.statusPending}
                              aria-label={`Deactivate ${u.display_name}`}
                              onClick={async () => {
                                // UX-flow audit (FLOW-A01): deactivation revokes
                                // access immediately — confirm first, matching
                                // the role-change pattern above.
                                const ok = await confirm({
                                  title: `Deactivate ${u.display_name}?`,
                                  description:
                                    "This revokes their portal access immediately. You can reactivate them later.",
                                  confirmLabel: "Deactivate",
                                  tone: "danger",
                                });
                                if (!ok) return;
                                statusMutation.mutate({
                                  user_id: u.user_id,
                                  status: "inactive",
                                });
                              }}
                            >
                              {rs.statusPending ? "…" : "Deactivate"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-success-fg hover:bg-success-softer"
                              disabled={rs.statusPending}
                              aria-label={`Activate ${u.display_name}`}
                              onClick={async () => {
                                // UX-flow audit (FLOW-A01): confirm to prevent an
                                // accidental access re-grant.
                                const ok = await confirm({
                                  title: `Activate ${u.display_name}?`,
                                  description: "This restores their portal access.",
                                  confirmLabel: "Activate",
                                });
                                if (!ok) return;
                                statusMutation.mutate({
                                  user_id: u.user_id,
                                  status: "active",
                                });
                              }}
                            >
                              {rs.statusPending ? "…" : "Activate"}
                            </button>
                          )}
                          {rs.statusError && (
                            <span className="text-2xs text-danger-fg">
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
          </div>
        )}
      </SectionCard>
    </>
  );
}
