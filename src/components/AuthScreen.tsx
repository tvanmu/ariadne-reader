import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import LabyrinthMark from './LabyrinthMark';

export type AuthMode = 'sign-in' | 'sign-up' | 'recover' | 'update-password';

interface AuthScreenProps {
  initialMode?: AuthMode;
  onCancel?: () => void;
  onPasswordUpdated?: () => void;
}

function getAuthRedirectUrl() {
  return new URL('/', window.location.origin).toString();
}

export default function AuthScreen({
  initialMode = 'sign-in',
  onCancel,
  onPasswordUpdated,
}: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === 'recover') {
      const result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthRedirectUrl(),
      });

      if (result.error) {
        setError(result.error.message);
      } else {
        setMessage('Password reset email sent. Open the link in your email to choose a new password.');
      }

      setLoading(false);
      return;
    }

    if (mode === 'update-password') {
      if (password !== confirmPassword) {
        setError('The two passwords do not match.');
        setLoading(false);
        return;
      }

      const result = await supabase.auth.updateUser({ password });

      if (result.error) {
        setError(result.error.message);
      } else {
        setPassword('');
        setConfirmPassword('');
        setMessage('Password updated. You can continue to your library.');
      }

      setLoading(false);
      return;
    }

    const result =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: getAuthRedirectUrl(),
            },
          });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === 'sign-up' && !result.data.session) {
      setMessage('Account created. Check your email if confirmation is enabled in Supabase.');
    }

    setLoading(false);
  }

  const isRecovering = mode === 'recover';
  const isUpdatingPassword = mode === 'update-password';
  const title = isRecovering
    ? 'Reset your password.'
    : isUpdatingPassword
      ? 'Choose a new password.'
      : 'Sync your reading.';
  const description = isRecovering
    ? 'Enter your account email and Ariadne will send a secure reset link.'
    : isUpdatingPassword
      ? 'Create a new password for your Ariadne account.'
      : 'One account keeps your PDFs, progress, chapters, deadlines, and reading time aligned across every browser.';
  const submitLabel = loading
    ? 'Working...'
    : isRecovering
      ? 'Send reset link'
      : isUpdatingPassword
        ? 'Update password'
        : mode === 'sign-in'
          ? 'Sign in'
          : 'Create account';

  return (
    <section className="auth-shell">
      <section className="auth-panel">
        {onCancel && !isUpdatingPassword ? (
          <button className="text-button back-text-button" type="button" onClick={onCancel}>
            <ArrowLeft size={15} />
            Continue locally
          </button>
        ) : null}
        <div className="crest">
          <LabyrinthMark size={36} />
        </div>
        <p className="eyebrow">Ariadne Reader</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isUpdatingPassword ? (
            <label>
              <span>Email</span>
              <div className="input-with-icon">
                <Mail size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
            </label>
          ) : null}

          {!isRecovering ? (
            <label>
              <span>{isUpdatingPassword ? 'New password' : 'Password'}</span>
              <div className="input-with-icon">
                <ShieldCheck size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  required
                />
              </div>
            </label>
          ) : null}

          {isUpdatingPassword ? (
            <label>
              <span>Confirm password</span>
              <div className="input-with-icon">
                <KeyRound size={16} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat new password"
                  minLength={6}
                  required
                />
              </div>
            </label>
          ) : null}

          {error ? <p className="form-note error">{error}</p> : null}
          {message ? <p className="form-note success">{message}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {submitLabel}
            <ArrowRight size={16} />
          </button>
        </form>

        {isUpdatingPassword && message && onPasswordUpdated ? (
          <button className="text-button" type="button" onClick={onPasswordUpdated}>
            Continue to library
          </button>
        ) : null}

        {!isUpdatingPassword ? (
          <div className="auth-actions">
            {mode === 'sign-in' ? (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setMode('recover');
                  setError(null);
                  setMessage(null);
                  setPassword('');
                }}
              >
                Forgot password?
              </button>
            ) : null}
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                setError(null);
                setMessage(null);
                setPassword('');
                setConfirmPassword('');
              }}
            >
              {mode === 'sign-in'
                ? 'Need an account?'
                : mode === 'sign-up'
                  ? 'Already have an account?'
                  : 'Return to sign in'}
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
}
