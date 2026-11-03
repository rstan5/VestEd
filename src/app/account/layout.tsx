import { AccountNav } from "@/components/account/account-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[880px]">
      <p className="text-sm text-quiet">Your account</p>
      <AccountNav />
      <div className="mt-8">{children}</div>
    </div>
  );
}
