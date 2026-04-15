"use client";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { useSession } from "@/lib/auth/session-provider";

export default function ProfilePage() {
  const { session } = useSession();
  return (
    <>
      <WorkflowHeader
        eyebrow="Account"
        title="Profile"
        description="Read-only profile for the fake session. Real Supabase auth lands in Window 5."
      />
      <SectionCard title="Session">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-fg-subtle">Display name</dt>
          <dd>{session.display_name}</dd>
          <dt className="text-fg-subtle">Email</dt>
          <dd className="font-mono">{session.email}</dd>
          <dt className="text-fg-subtle">Role</dt>
          <dd className="font-mono">{session.role}</dd>
          <dt className="text-fg-subtle">User id</dt>
          <dd className="font-mono">{session.user_id}</dd>
        </dl>
      </SectionCard>
    </>
  );
}
