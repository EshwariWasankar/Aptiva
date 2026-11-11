import { RegisterForm } from '../../components/RegisterForm';

export const metadata = { title: 'Create account — Aptiva' };

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Tell us a little about yourself to get started.
        </p>
      </div>
      <RegisterForm />
    </main>
  );
}
