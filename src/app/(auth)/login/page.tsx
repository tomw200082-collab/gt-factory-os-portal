import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="mx-auto mt-16 max-w-md">
      <div className="card p-6">
        <div className="text-lg font-semibold">Sign in</div>
        <p className="mt-1 text-sm text-fg-muted">
          Real authentication lands in Window 5 (Supabase magic link). For now, the
          portal runs with a fake session — switch roles from the chip in the top bar.
        </p>
        <div className="mt-4">
          <Link href="/dashboard" className="btn btn-primary w-full justify-center">
            Continue with fake session
          </Link>
        </div>
      </div>
    </div>
  );
}
