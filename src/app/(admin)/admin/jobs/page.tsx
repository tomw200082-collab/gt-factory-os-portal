import { PendingSurfacePlaceholder } from "@/components/system/PendingSurfacePlaceholder";

export default function AdminJobsPage() {
  return (
    <PendingSurfacePlaceholder
      eyebrow="Admin · system"
      title="Jobs"
      description="Scheduled job monitor — recent runs, last success / failure, skip reasons (break-glass / preconditions), and per-job last_error — is blocked on a backend endpoint. Jobs are executed and logged server-side in private_core.integration_runs and related tables, but there is no portal-readable projection yet."
      missingEndpoints={[
        "GET /api/v1/queries/jobs",
        "GET /api/v1/queries/job-runs?job_id=<id>",
        "GET /api/v1/queries/jobs/health?window=24h",
      ]}
      note="Once the jobs query endpoints land, the dashboard Jobs 24h panel and this screen will light up together."
    />
  );
}
