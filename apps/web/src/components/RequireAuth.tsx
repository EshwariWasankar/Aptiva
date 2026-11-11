'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../lib/session';

/**
 * Client-side route guard (PH1-T05). Server-side enforcement remains the
 * API's job — this only shapes UX. `role` optionally restricts to one
 * role or a list of roles.
 */
export function RequireAuth({ children, role }: { children: ReactNode; role?: string | string[] }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const allowed = role === undefined ? null : Array.isArray(role) ? role : [role];
  const permitted = allowed === null || (user !== null && allowed.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (allowed && !allowed.includes(user.role)) {
      router.replace('/');
    }
  }, [user, loading, allowed, router]);

  if (loading || !user || !permitted) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">Loading…</div>
    );
  }
  return <>{children}</>;
}
