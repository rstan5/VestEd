import type { Metadata } from "next";
import { signOut } from "@/app/auth/actions";
import { PasswordForm } from "@/components/account/password-form";
import { requireAccount } from "@/lib/account/session";
import { memberSinceLabel } from "@/lib/account/types";

export const metadata: Metadata = { title: "Settings · VestEd" };

export default async function SettingsPage() {
  const account = await requireAccount("/account/settings");
  return (
    <div className="max-w-[640px] space-y-10">
      <section aria-labelledby="settings-heading">
        <h1 id="settings-heading" className="serif text-[34px] leading-tight text-forest">Settings</h1>
        <dl className="mt-5 divide-y divide-rule border-y border-rule text-sm">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-quiet">Email</dt>
            <dd className="text-forest" data-testid="account-email">{account.email}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-quiet">Sign-in method</dt>
            <dd className="text-forest">Email and password</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-quiet">Member since</dt>
            <dd className="text-forest">{memberSinceLabel(account.memberSince)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-quiet">Account id</dt>
            <dd className="mono break-all text-right text-[12px] text-forest" data-testid="account-id">{account.id}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="password-heading">
        <h2 id="password-heading" className="serif text-2xl text-forest">Change password</h2>
        <div className="mt-4 rounded-3xl border border-rule bg-paper p-6">
          <PasswordForm />
        </div>
      </section>

      <section aria-labelledby="signout-heading">
        <h2 id="signout-heading" className="serif text-2xl text-forest">Sign out</h2>
        <p className="mt-2 text-sm text-quiet">Ends your session in this browser.</p>
        <form action={signOut} className="mt-4">
          <button type="submit" className="v-btn quiet">Sign out</button>
        </form>
      </section>
    </div>
  );
}
