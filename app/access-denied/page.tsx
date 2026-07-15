import Link from "next/link";
import { ShieldAlert, UserX, DatabaseZap, Ban } from "lucide-react";
import { logout } from "@/lib/actions/auth";

type Reason = "no-profile" | "inactive" | "db-error" | "permission-denied" | undefined;

const CONTENT: Record<
  NonNullable<Reason>,
  { icon: typeof ShieldAlert; title: string; message: string }
> = {
  "no-profile": {
    icon: UserX,
    title: "Account not provisioned",
    message:
      "Your sign-in was successful, but there's no application profile linked to your account yet. An administrator needs to create your profile before you can use FFC Shipments.",
  },
  inactive: {
    icon: Ban,
    title: "Account deactivated",
    message:
      "Your application profile exists but has been deactivated. If you believe this is a mistake, contact your administrator to have it reactivated.",
  },
  "db-error": {
    icon: DatabaseZap,
    title: "Couldn't load your account",
    message:
      "We hit an unexpected error while checking your account. This is usually temporary — try signing in again in a moment. If it keeps happening, let FFC IT know.",
  },
  "permission-denied": {
    icon: ShieldAlert,
    title: "Access denied",
    message: "Your account doesn't have permission to view this page.",
  },
};

export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: Reason }>;
}) {
  const { reason } = await searchParams;
  const info = CONTENT[reason ?? "permission-denied"] ?? CONTENT["permission-denied"];
  const Icon = info.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-light text-danger">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">{info.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{info.message}</p>

        <div className="mt-6 space-y-2">
          <form action={logout}>
            <button
              type="submit"
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-dark"
            >
              Sign out
            </button>
          </form>
          <Link
            href="/login"
            className="block w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-surface-muted"
          >
            Back to sign in
          </Link>
        </div>

        <p className="mt-6 border-t border-border pt-4 text-xs text-ink-muted">
          Need access? Contact FFC IT with your name and the branch you work
          from, and ask them to provision your Shipments account.
        </p>
      </div>
    </div>
  );
}
