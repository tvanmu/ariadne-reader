import { KeyRound } from 'lucide-react';

export default function ConfigMissing() {
  return (
    <main className="app-shell centered-shell">
      <section className="auth-panel">
        <div className="crest">
          <KeyRound size={24} />
        </div>
        <p className="eyebrow">Supabase setup needed</p>
        <h1>Ariadne needs a project before accounts can work.</h1>
        <p className="muted">
          Create <code>.env.local</code> from <code>.env.example</code>, then add your Supabase
          project URL and publishable key. These environment variables are configuration values the
          frontend reads at startup.
        </p>
        <div className="code-panel">
          <code>VITE_SUPABASE_URL=...</code>
          <code>VITE_SUPABASE_PUBLISHABLE_KEY=...</code>
        </div>
      </section>
    </main>
  );
}
