"use client";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

interface AppUser { user_id: string; email: string; display_name: string; role: string; status: string; created_at: string; }

const ROLE_COLORS: Record<string, string> = { admin: "text-purple-700", planner: "text-blue-700", operator: "text-green-700", viewer: "text-muted-foreground" };

export default function AdminUsersPage() {
  const { data, isLoading, error } = useQuery<{ rows: AppUser[] }>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });

  return (
    <>
      <WorkflowHeader eyebrow="Admin" title="Users" description="App users with roles. To add a new user: have them sign in via magic-link, then insert a row in private_core.app_users with the correct role." />
      <SectionCard eyebrow="Users" title="Active Users">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">Error loading users. Check /api/users proxy exists.</p>}
        {data && data.rows.length === 0 && <p className="text-sm text-muted-foreground">No users found.</p>}
        {data && data.rows.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4 font-medium">Name</th><th className="pb-2 pr-4 font-medium">Email</th><th className="pb-2 pr-4 font-medium">Role</th><th className="pb-2 font-medium">Status</th></tr></thead>
            <tbody>
              {data.rows.map(u => (
                <tr key={u.user_id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{u.display_name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{u.email}</td>
                  <td className={`py-2 pr-4 text-xs font-medium ${ROLE_COLORS[u.role] ?? ""}`}>{u.role}</td>
                  <td className="py-2 text-xs text-muted-foreground">{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-4 text-xs text-muted-foreground">To invite new users: send magic-link invite via Supabase dashboard → user signs in → insert row in private_core.app_users with correct role.</p>
      </SectionCard>
    </>
  );
}
