import { useState, type FormEvent } from 'react';
import { api, type User } from './api';
import './agent-login.css';

type AgentLoginProps = {
  onLogin: (user: User) => void | Promise<void>;
};

export default function AgentLogin({ onLogin }: AgentLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mainLoginUrl = import.meta.env.BASE_URL || '/';

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.login(email.trim(), password);
      if (result.user.role !== 'TRAVEL_AGENT') {
        setError('This sign-in is for travel agents. Use the main sign-in page for other accounts.');
        return;
      }
      api.setToken(result.accessToken);
      try {
        await onLogin(result.user);
      } catch (loginError) {
        api.setToken(null);
        throw loginError;
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="agent-login-page">
      <section className="agent-login-story" aria-label="About the VOYA Agent Network">
        <header className="agent-login-story-header">
          <div className="agent-login-brand">
            <span className="agent-login-brand-mark" aria-hidden="true">V<span>.</span></span>
            <div className="agent-login-brand-label"><strong>VOYA</strong><small>PARTNER NETWORK</small></div>
          </div>
          <span className="agent-login-story-tag">TRAVEL, MADE CONNECTED</span>
        </header>

        <div className="agent-login-story-main">
          <span className="agent-login-story-eyebrow"><span className="agent-login-live-dot" /> MADE FOR TRAVEL PROFESSIONALS</span>
          <h1>Every journey<br />starts with a <em>great</em><br />partner.</h1>
          <p>Discover exceptional experiences, connect with trusted suppliers, and turn every enquiry into a journey worth remembering.</p>
          <div className="agent-login-story-points">
            <span><span aria-hidden="true">✦</span> Curated experiences</span>
            <span><span aria-hidden="true">✦</span> Seamless bookings</span>
          </div>
        </div>

        <div className="agent-login-art" aria-hidden="true">
          <div className="agent-login-art-glow" />
          <div className="agent-login-art-orbit orbit-one" />
          <div className="agent-login-art-orbit orbit-two" />
          <div className="agent-login-art-sun" />
          <div className="agent-login-art-hill hill-back" />
          <div className="agent-login-art-hill hill-mid" />
          <div className="agent-login-art-hill hill-front" />
          <div className="agent-login-art-track" />
          <div className="agent-login-float-card card-explore">
            <span className="agent-login-float-icon">✧</span>
            <span><b>Explore more</b><small>Experiences that inspire</small></span>
          </div>
          <div className="agent-login-float-card card-partners">
            <span className="agent-login-float-icon warm">↗</span>
            <span><b>Work smarter</b><small>One connected workspace</small></span>
          </div>
        </div>

        <footer className="agent-login-story-footer">
          <span>THE WORLD IS WAITING.</span>
          <span>EXPLORE · PLAN · BOOK</span>
        </footer>
      </section>

      <section className="agent-login-access" aria-label="Travel agent sign in">
        <div className="agent-login-access-top">
          <span className="agent-login-access-pill"><span className="agent-login-pill-dot" /> AGENT PORTAL</span>
          <a href={mainLoginUrl} className="agent-login-main-link">Main sign in <span aria-hidden="true">↗</span></a>
        </div>

        <div className="agent-login-form-area">
          <div className="agent-login-mobile-brand">
            <span className="agent-login-brand-mark" aria-hidden="true">V<span>.</span></span>
            <strong>VOYA</strong>
          </div>
          <div className="agent-login-form-heading">
            <span className="agent-login-form-kicker">WELCOME TO YOUR WORKSPACE</span>
            <h2>Welcome back<span>.</span></h2>
            <p>Your next great journey begins here. Sign in to your agent account to continue.</p>
          </div>

          <form className="agent-login-form" onSubmit={signIn}>
            {error && <div className="agent-login-error" role="alert">{error}</div>}

            <label className="agent-login-field">
              <span>Work email</span>
              <input
                type="email"
                name="email"
                placeholder="you@youragency.com"
                autoComplete="username"
                spellCheck={false}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </label>

            <label className="agent-login-field">
              <span>Password</span>
              <div className="agent-login-password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="agent-login-show-password"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={busy}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <div className="agent-login-help-row">
              <span><span className="agent-login-lock" aria-hidden="true">♢</span> Secure partner access</span>
              <span>Forgot password? Contact your admin</span>
            </div>

            <button className="agent-login-submit" type="submit" disabled={busy}>
              <span>{busy ? 'Signing you in…' : 'Sign in to Agent Portal'}</span>
              <span className="agent-login-submit-arrow" aria-hidden="true">→</span>
            </button>
          </form>

          <div className="agent-login-support">
            <span className="agent-login-support-mark" aria-hidden="true">?</span>
            <p><b>Need access to VOYA?</b><br />Ask your organization administrator to set up your agent account.</p>
          </div>
        </div>

        <footer className="agent-login-access-footer">
          <span>© {new Date().getFullYear()} VOYA. All rights reserved.</span>
          <span>Built for better journeys.</span>
        </footer>
      </section>
    </main>
  );
}
