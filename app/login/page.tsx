"use client";

import Image from "next/image";
import { useActionState } from "react";
import { login, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="flex min-h-screen">
      {/* Photo panel — hidden below lg, since a split-screen layout only
          reads well with real width to work with; the form alone is the
          right call on a phone-sized viewport. */}
      <div className="relative hidden w-[46%] shrink-0 lg:block">
        <Image src="/login-hero.jpg" alt="" fill sizes="46vw" className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/90 via-primary-dark/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end p-12 xl:p-16">
          <h2 className="text-2xl font-semibold text-white xl:text-3xl">FFC Shipments Management System</h2>
          <p className="mt-2 max-w-sm text-sm text-white/85">
            Shipment, Customs, Documentation and Follow-up Platform — Dubai Air Freight Unit.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-surface-muted px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 text-center">
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full shadow-sm">
              <Image src="/ffc-logo.png" alt="FFC" fill sizes="56px" className="object-contain" priority />
            </span>
            <h1 className="text-lg font-semibold text-ink">FFC Shipments</h1>
            <p className="text-sm text-ink-muted">Sign in to your account</p>
          </div>

          <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
            {state.error && (
              <div className="rounded-md bg-danger-light px-3 py-2 text-sm text-danger" role="alert">
                {state.error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-invalid={!!state.fieldErrors?.email}
              />
              {state.fieldErrors?.email && (
                <p className="text-xs text-danger">{state.fieldErrors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                aria-invalid={!!state.fieldErrors?.password}
              />
              {state.fieldErrors?.password && (
                <p className="text-xs text-danger">{state.fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-white transition hover:bg-primary-dark disabled:opacity-60"
            >
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-muted">
            Accounts are provisioned by your administrator. Contact IT if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
