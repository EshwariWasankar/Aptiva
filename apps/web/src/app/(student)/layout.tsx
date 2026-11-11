'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { RequireAuth } from '../../components/RequireAuth';
import { useSession } from '../../lib/session';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plan', label: 'Plan' },
  { href: '/practice', label: 'Practice' },
  { href: '/notebook', label: 'Notebook' },
  { href: '/profile', label: 'Profile' },
  { href: '/settings', label: 'Settings' },
];

function StudentNav() {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="text-lg font-semibold">
          Aptiva
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href
                  ? 'font-medium text-neutral-900'
                  : 'text-neutral-600 hover:text-neutral-900'
              }
            >
              {item.label}
            </Link>
          ))}
          <span className="text-neutral-400">{user?.email}</span>
          <button
            type="button"
            onClick={() => void signOut().then(() => (window.location.href = '/login'))}
            className="text-neutral-600 underline"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <StudentNav />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </RequireAuth>
  );
}
