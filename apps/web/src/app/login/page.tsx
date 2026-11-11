import { LoginForm } from '../../components/LoginForm';

export const metadata = { title: 'Sign in — Aptiva' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-neutral-600">Sign in to your Aptiva account.</p>
      </div>
      <LoginForm />
    </main>
  );
}
