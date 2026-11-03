"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const accountSections = [
  { href: "/account/profile", label: "Profile" },
  { href: "/account/privacy", label: "Privacy" },
  { href: "/account/verification", label: "University verification" },
  { href: "/account/settings", label: "Settings" },
] as const;

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account sections" className="mt-3 overflow-x-auto border-b border-rule">
      <ul className="-mb-px flex gap-6 whitespace-nowrap">
        {accountSections.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 pb-3 pt-1 text-sm ${active ? "border-forest font-medium text-deep" : "border-transparent text-quiet hover:text-forest"}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
