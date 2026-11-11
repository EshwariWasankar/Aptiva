import { ResetPasswordPanel } from '../../components/ResetPasswordPanel';

export const metadata = { title: 'Reset password — Aptiva' };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <ResetPasswordPanel />
    </main>
  );
}
