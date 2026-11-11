'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { RequireAuth } from '../../components/RequireAuth';
import { useSession } from '../../lib/session';

const NAV: { href: string; label: string; roles: string[] }[] = [
  { href: '/admin', label: 'Overview', roles: ['admin', 'reviewer'] },
  { href: '/admin/questions', label: 'Questions', roles: ['admin', 'reviewer'] },
  { href: '/admin/import', label: 'Import', roles: ['admin'] },
  { href: '/admin/blueprints', label: 'Blueprints', roles: ['admin'] },
  { href: '/admin/review', label: 'Review', roles: ['admin', 'reviewer'] },
];

function AdminNav() {
  const { user, signOut } = useSession();
  const items = NAV.filter((n) => user && n.roles.includes(user.role));
  return (
    <header className="border-b border-neutral-800 bg-neutral-900 text-neutral-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/admin" className="text-lg font-semibold">
          Aptiva Admin
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="text-neutral-300 hover:text-white">
              {item.label}
            </Link>
          ))}
          <span className="text-neutral-500">{user?.email}</span>
          <button
            type="button"
            onClick={() => void signOut().then(() => (window.location.href = '/login'))}
            className="text-neutral-300 underline"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth role={['admin', 'reviewer']}>
      <AdminNav />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </RequireAuth>
  );
}
