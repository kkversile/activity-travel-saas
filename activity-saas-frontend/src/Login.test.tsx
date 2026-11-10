import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { Login, Register } from './App';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('vendor passwordless login flow', () => {
  it('matches the Partner Hub prototype entry layout on vendor routes', () => {
    window.history.replaceState({}, '', '/vendor/products');

    render(<Login onLogin={vi.fn()} onRegister={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'List your tours, tickets and experiences in front of millions of Indian travellers.' })).toBeInTheDocument();
    expect(screen.getByText('Log in', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendor Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends the prototype email-or-mobile identifier to the password login API', async () => {
    window.history.replaceState({}, '', '/vendor/products');
    const user = { id: 'vendor-owner', email: 'owner@example.com', fullName: 'Vendor Owner', role: 'VENDOR', tenantId: 'tenant-1', active: true } as never;
    const login = vi.spyOn(api, 'login').mockResolvedValue({ accessToken: 'access-token', user } as never);
    const onLogin = vi.fn();

    render(<Login onLogin={onLogin} onRegister={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Email or mobile'), { target: { value: '+91 98765 43210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('+91 98765 43210', expect.any(String)));
    expect(onLogin).toHaveBeenCalledWith(user);
  });

  it('keeps demo role shortcuts available on the internal admin login route', () => {
    window.history.replaceState({}, '', '/admin/products');

    render(<Login onLogin={vi.fn()} onRegister={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Admin Login' })).toBeInTheDocument();
  });

  it('requests and verifies an OTP using the login challenge API', async () => {
    vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    const requestCode = vi.spyOn(api, 'requestVendorLoginCode').mockResolvedValue({
      challengeId: 'login-challenge-1', message: 'If this email can access a vendor account, a sign-in code has been sent.', demoOtp: '123456',
    });
    const verifyCode = vi.spyOn(api, 'verifyVendorLoginCode').mockResolvedValue({
      accessToken: 'access-token',
      user: { id: 'vendor-1', email: 'vendor@example.com', fullName: 'Vendor Owner', role: 'VENDOR', tenantId: 'tenant-1', organizationRole: 'OWNER', active: true } as never,
    });
    const onLogin = vi.fn();

    render(<Login onLogin={onLogin} onRegister={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log in with OTP instead' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'vendor@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in code' }));

    expect(await screen.findByText('Local demo code: 123456')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('6-digit sign-in code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ email: 'vendor@example.com' })));
    expect(requestCode).toHaveBeenCalledWith('vendor@example.com');
    expect(verifyCode).toHaveBeenCalledWith('login-challenge-1', '123456', '00000000-0000-4000-8000-000000000001');
  });
});

describe('vendor registration phone verification', () => {
  it('accepts a team invitation into the invited workspace without creating a new vendor profile', async () => {
    const invitationToken = 'A'.repeat(43);
    window.history.replaceState({}, '', `/register?teamInvite=${invitationToken}`);
    const user = { id: 'member-1', email: 'ops@example.com', fullName: 'Operations Member', role: 'VENDOR', tenantId: 'tenant-existing', organizationRole: 'OPERATIONS', active: true } as never;
    const register = vi.spyOn(api, 'register').mockResolvedValue({ accessToken: 'member-token', user });
    const request = vi.spyOn(api, 'request').mockResolvedValue({ email: 'ops@example.com', role: 'OPERATIONS', workspaceName: 'Coastal Tours', expiresAt: '2026-11-11T00:00:00.000Z' } as never);
    const onRegistered = vi.fn();

    render(<Register onRegistered={onRegistered} onBack={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Join Coastal Tours' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Business / brand name')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Invited email')).toHaveValue('ops@example.com');
    fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Operations Member' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'safePass123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() => expect(register).toHaveBeenCalledWith({ fullName: 'Operations Member', email: 'ops@example.com', password: 'safePass123', acceptedTerms: true, teamInviteToken: invitationToken }));
    expect(request).toHaveBeenCalledWith(`/auth/vendor/team-invitations/${invitationToken}`);
    expect(onRegistered).toHaveBeenCalledWith(user);
    expect(request).not.toHaveBeenCalledWith('/vendor/onboarding/otp/request', expect.anything());
  });

  it('enforces the password hint before creating an account', async () => {
    const register = vi.spyOn(api, 'register');
    render(<Register onRegistered={vi.fn()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Owner Name' } });
    fireEvent.change(screen.getByLabelText('Business / brand name'), { target: { value: 'Coastal Tours' } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '+919876543210' } });
    fireEvent.change(screen.getByLabelText('Main city'), { target: { value: 'Panaji' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'safePassword' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account & continue' }));

    expect(await screen.findByText('Password must be at least 8 characters and include a number.')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('persists the phone OTP through onboarding before entering the vendor portal', async () => {
    const user = { id: 'vendor-2', email: 'owner@example.com', fullName: 'Owner Name', role: 'VENDOR', tenantId: 'tenant-2', organizationRole: 'OWNER', active: true } as never;
    const register = vi.spyOn(api, 'register').mockResolvedValue({ accessToken: 'vendor-token', user });
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/onboarding') return { emailVerificationEnabled: false, mobileVerificationEnabled: true } as never;
      if (path === '/vendor/onboarding/otp/request') return { demoOtp: '123456' } as never;
      if (path === '/vendor/onboarding/otp/verify') return { verified: true } as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    const onRegistered = vi.fn();

    render(<Register onRegistered={onRegistered} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Owner Name' } });
    fireEvent.change(screen.getByLabelText('Business / brand name'), { target: { value: 'Coastal Tours' } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '+91 98765 43210' } });
    fireEvent.change(screen.getByLabelText('Main city'), { target: { value: 'Panaji' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'safePass123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account & continue' }));

    expect(await screen.findByText('Local demo code: 123456')).toBeInTheDocument();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ mobile: '+919876543210' }));
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/otp/request', { method: 'POST', body: JSON.stringify({ contactNumber: '+919876543210' }) });
    fireEvent.change(screen.getByLabelText('Mobile OTP'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(onRegistered).toHaveBeenCalledWith(user));
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/otp/verify', { method: 'POST', body: JSON.stringify({ otp: '123456' }) });
  });

  it('does not claim an OTP was sent or allow verification when delivery fails', async () => {
    const user = { id: 'vendor-3', email: 'owner@example.com', fullName: 'Owner Name', role: 'VENDOR', tenantId: 'tenant-3', organizationRole: 'OWNER', active: true } as never;
    vi.spyOn(api, 'register').mockResolvedValue({ accessToken: 'vendor-token', user });
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/onboarding') return { emailVerificationEnabled: false, mobileVerificationEnabled: true } as never;
      throw new Error('Mobile verification delivery is not configured');
    });

    render(<Register onRegistered={vi.fn()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Owner Name' } });
    fireEvent.change(screen.getByLabelText('Business / brand name'), { target: { value: 'Coastal Tours' } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '+919876543210' } });
    fireEvent.change(screen.getByLabelText('Main city'), { target: { value: 'Panaji' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'safePass123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account & continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mobile verification delivery is not configured');
    expect(screen.getByLabelText('Mobile OTP')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verify and continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send mobile code' })).toBeEnabled();
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/otp/request', expect.objectContaining({ method: 'POST' }));
  });

  it('verifies new vendors by email when global mobile verification is disabled', async () => {
    vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    const user = { id: 'vendor-4', email: 'owner@example.com', fullName: 'Owner Name', role: 'VENDOR', tenantId: 'tenant-4', organizationRole: 'OWNER', active: true } as never;
    vi.spyOn(api, 'register').mockResolvedValue({ accessToken: 'vendor-token', user });
    vi.spyOn(api, 'request').mockResolvedValue({ mobileVerificationEnabled: false } as never);
    const requestCode = vi.spyOn(api, 'requestVendorLoginCode').mockResolvedValue({ challengeId: 'email-challenge', message: 'sent', demoOtp: '123456' });
    const verifyCode = vi.spyOn(api, 'verifyVendorLoginCode').mockResolvedValue({ accessToken: 'verified-token', user });
    const onRegistered = vi.fn();

    render(<Register onRegistered={onRegistered} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Owner Name' } });
    fireEvent.change(screen.getByLabelText('Business / brand name'), { target: { value: 'Coastal Tours' } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '+91 98765 43210' } });
    fireEvent.change(screen.getByLabelText('Main city'), { target: { value: 'Panaji' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'safePass123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account & continue' }));

    expect(await screen.findByRole('heading', { name: 'Verify your account' })).toBeInTheDocument();
    expect(screen.queryByText('Verify your mobile')).not.toBeInTheDocument();
    expect(screen.getByText('Local demo code: 123456')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email OTP'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(onRegistered).toHaveBeenCalledWith(user));
    expect(requestCode).toHaveBeenCalledWith('owner@example.com');
    expect(verifyCode).toHaveBeenCalledWith('email-challenge', '123456', '00000000-0000-4000-8000-000000000001');
  });

  it('shows both verification sections together and verifies distinct email and mobile codes', async () => {
    vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000002');
    const user = { id: 'vendor-5', email: 'owner@example.com', fullName: 'Owner Name', role: 'VENDOR', tenantId: 'tenant-5', organizationRole: 'OWNER', active: true } as never;
    vi.spyOn(api, 'register').mockResolvedValue({ accessToken: 'vendor-token', user });
    const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/vendor/onboarding') return { emailVerificationEnabled: true, mobileVerificationEnabled: true } as never;
      if (path === '/vendor/onboarding/otp/request') return { demoOtp: '654321' } as never;
      if (path === '/vendor/onboarding/otp/verify') return { verified: true } as never;
      throw new Error(`Unexpected request: ${path}`);
    });
    const requestEmail = vi.spyOn(api, 'requestVendorLoginCode').mockResolvedValue({ challengeId: 'both-email-challenge', message: 'sent', demoOtp: '123456' });
    const verifyEmail = vi.spyOn(api, 'verifyVendorLoginCode').mockResolvedValue({ accessToken: 'verified-token', user });
    const onRegistered = vi.fn();

    render(<Register onRegistered={onRegistered} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your full name'), { target: { value: 'Owner Name' } });
    fireEvent.change(screen.getByLabelText('Business / brand name'), { target: { value: 'Coastal Tours' } });
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'owner@example.com' } });
    fireEvent.change(screen.getByLabelText('Mobile number'), { target: { value: '+91 98765 43210' } });
    fireEvent.change(screen.getByLabelText('Main city'), { target: { value: 'Panaji' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'safePass123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create account & continue' }));

    expect(await screen.findByLabelText('Email OTP')).toBeInTheDocument();
    expect(screen.getByLabelText('Mobile OTP')).toBeInTheDocument();
    expect(requestEmail).toHaveBeenCalledWith('owner@example.com');
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/otp/request', expect.objectContaining({ method: 'POST' }));
    fireEvent.change(screen.getByLabelText('Email OTP'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('Mobile OTP'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(onRegistered).toHaveBeenCalledWith(user));
    expect(verifyEmail).toHaveBeenCalledWith('both-email-challenge', '123456', '00000000-0000-4000-8000-000000000002');
    expect(request).toHaveBeenCalledWith('/vendor/onboarding/otp/verify', { method: 'POST', body: JSON.stringify({ otp: '654321' }) });
  });
});
