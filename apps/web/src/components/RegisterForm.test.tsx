import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RegisterForm } from './RegisterForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../lib/session', () => ({
  useSession: () => ({ reload: vi.fn() }),
}));
vi.mock('../lib/apiClient', async () => {
  const mod = (await vi.importActual('../lib/apiClient')) as Record<string, unknown>;
  return { ...mod, register: vi.fn() };
});

import { register } from '../lib/apiClient';

const registerMock = vi.mocked(register);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fillValid() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@b.co' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: 'Str0ng!Password' },
  });
}

describe('RegisterForm', () => {
  it('requires the consent checkbox', async () => {
    render(<RegisterForm />);
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(screen.getByText(/consent is required/i)).toBeTruthy());
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects short passwords before submit', async () => {
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@b.co' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(screen.getAllByText(/at least 10 characters/i).length).toBeGreaterThan(0),
    );
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('submits a valid payload including consentVersion', async () => {
    registerMock.mockResolvedValue({
      accessToken: 't',
      user: { id: 'u', email: 'new@b.co', role: 'student', emailVerified: false },
    });
    render(<RegisterForm />);
    fillValid();
    fireEvent.click(screen.getByLabelText(/privacy notice/i));
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@b.co',
          password: 'Str0ng!Password',
          consentVersion: '2026-11',
        }),
      ),
    );
  });
});
