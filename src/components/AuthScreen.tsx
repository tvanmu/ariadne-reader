import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AuthMode = 'sign-in' | 'sign-up';

interface AuthScreenProps {
  onCancel?: () => void;
}

export default function AuthScreen({ onCancel }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const result =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === 'sign-up' && !result.data.session) {
      setMessage('Account created. Check your email if confirmation is enabled in Supabase.');
    }

    setLoading(false);
  }

  return (
    <section className="auth-shell">
      <section className="auth-panel">
        {onCancel ? (
          <button className="text-button back-text-button" type="button" onClick={onCancel}>
            <ArrowLeft size={15} />
            Continue locally
          </button>
        ) : null}
        <div className="crest">
          <BookOpen size={28} />
        </div>
        <p className="eyebrow">Ariadne Reader</p>
        <h1>A calm path through dense documents.</h1>
        <p className="muted">
          Sign in to sync PDFs, progress, chapters, deadlines, and reading time across browsers.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
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

          <label>
            <span>Password</span>
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

          {error ? <p className="form-note error">{error}</p> : null}
          {message ? <p className="form-note success">{message}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Working...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            <ArrowRight size={16} />
          </button>
        </form>

        <button
          className="text-button"
          type="button"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setError(null);
            setMessage(null);
          }}
        >
          {mode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}
        </button>
      </section>
    </section>
  );
}
