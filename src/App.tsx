import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BookOpen, LogOut } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import AuthScreen from './components/AuthScreen';
import ConfigMissing from './components/ConfigMissing';
import Dashboard from './components/Dashboard';
import PdfReader from './components/PdfReader';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setActiveProjectId(null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) {
    return <ConfigMissing />;
  }

  if (!authReady) {
    return (
      <main className="app-shell centered-shell">
        <div className="quiet-loader" aria-label="Loading Ariadne Reader">
          <BookOpen size={28} />
          <span>Opening the archive...</span>
        </div>
      </main>
    );
  }

  if (!session?.user) {
    return <AuthScreen />;
  }

  return (
    <main className="app-shell">
      <header className="global-header">
        <button
          className="wordmark-button"
          type="button"
          onClick={() => setActiveProjectId(null)}
          aria-label="Return to dashboard"
        >
          <span className="wordmark-mark" aria-hidden="true" />
          <span>
            <strong>Ariadne Reader</strong>
            <small>A thread through every PDF.</small>
          </span>
        </button>

        <button
          className="icon-text-button subtle"
          type="button"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </header>

      {activeProjectId ? (
        <PdfReader projectId={activeProjectId} onBack={() => setActiveProjectId(null)} />
      ) : (
        <Dashboard user={session.user} onOpenProject={setActiveProjectId} />
      )}
    </main>
  );
}
