import { StatusNote } from "@/components/ui";

export function AuthFrame({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[440px]">
      <p className="text-sm text-quiet">{eyebrow}</p>
      <h1 className="serif mt-1 text-[40px] leading-[1.1] text-forest">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-quiet">{intro}</p>
      <div className="mt-8 rounded-3xl border border-rule bg-paper p-6 md:p-8">{children}</div>
      <p className="mt-6 text-center text-[12px] leading-5 text-quiet">Paper trading only. No real money moves through VestEd.</p>
    </div>
  );
}

export function AccountsUnavailable() {
  return (
    <StatusNote
      kind="unavailable"
      title="Accounts are unavailable"
      body="This build has no Supabase URL or key configured. Start local Supabase and fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    />
  );
}
