import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginForm } from './LoginForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../lib/session', () => ({
  useSession: () => ({ reload: vi.fn() }),
}));
vi.mock('../lib/apiClient', async () => {
  const mod = (await vi.importActual('../lib/apiClient')) as Record<string, unknown>;
  return { ...mod, login: vi.fn() };
});

import { login } from '../lib/apiClient';

const loginMock = vi.mocked(login);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.c' } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'secret123' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginForm', () => {
  it('shows a generic error on failed login', async () => {
    loginMock.mockRejectedValue(
      new (await import('../lib/apiClient')).ApiError(
        'UNAUTHENTICATED',
        'Invalid credentials',
        401,
      ),
    );
    render(<LoginForm />);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/invalid email or password/i);
  });

  it('shows a rate-limit message on 429', async () => {
    const { ApiError } = await import('../lib/apiClient');
    loginMock.mockRejectedValue(new ApiError('RATE_LIMITED', 'slow down', 429));
    render(<LoginForm />);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/too many attempts/i);
  });

  it('submits credentials on success path', async () => {
    loginMock.mockResolvedValue({
      accessToken: 't',
      user: { id: 'u', email: 'a@b.c', role: 'student', emailVerified: true },
    });
    render(<LoginForm />);
    fillAndSubmit();
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('a@b.c', 'secret123'));
  });
});
