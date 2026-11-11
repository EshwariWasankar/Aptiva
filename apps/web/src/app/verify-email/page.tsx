import { VerifyEmailPanel } from '../../components/VerifyEmailPanel';

export const metadata = { title: 'Verify email — Aptiva' };

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <VerifyEmailPanel />
    </main>
  );
}
