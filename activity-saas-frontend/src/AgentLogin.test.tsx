import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type User } from './api';
import AgentLogin from './AgentLogin';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const agent = {
  id: 'agent-user',
  email: 'agent@example.test',
  role: 'TRAVEL_AGENT',
  tenantId: 'agent-tenant',
} as User;

describe('AgentLogin', () => {
  it('submits agent credentials using the existing API and completes the normal sign-in handoff', async () => {
    const login = vi.spyOn(api, 'login').mockResolvedValue({ accessToken: 'signed-agent-token', user: agent });
    const setToken = vi.spyOn(api, 'setToken').mockImplementation(() => undefined);
    const onLogin = vi.fn();

    render(<AgentLogin onLogin={onLogin} />);
    fireEvent.change(screen.getByPlaceholderText('you@youragency.com'), { target: { value: ' Agent@Example.test ' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to Agent Portal/i }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(agent));
    expect(login).toHaveBeenCalledWith('Agent@Example.test', 'password123');
    expect(setToken).toHaveBeenCalledWith('signed-agent-token');
  });

  it('does not save a vendor/admin token on the agent-only sign-in page', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({
      accessToken: 'vendor-token',
      user: { ...agent, role: 'VENDOR' },
    });
    const setToken = vi.spyOn(api, 'setToken').mockImplementation(() => undefined);
    const onLogin = vi.fn();

    render(<AgentLogin onLogin={onLogin} />);
    fireEvent.change(screen.getByPlaceholderText('you@youragency.com'), { target: { value: 'vendor@example.test' } });
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in to Agent Portal/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('for travel agents');
    expect(setToken).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('allows the user to show and hide the password', () => {
    render(<AgentLogin onLogin={vi.fn()} />);
    const password = screen.getByPlaceholderText('Enter your password') as HTMLInputElement;
    expect(password.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password.type).toBe('password');
  });

  it('keeps a return link to the shared sign-in flow', () => {
    render(<AgentLogin onLogin={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Main sign in/i })).toHaveAttribute('href');
  });
});
