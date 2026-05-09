import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import LabyrinthMark from './components/LabyrinthMark';
import PdfReader from './components/PdfReader';
import StatueLineBackdrop from './components/StatueLineBackdrop';

type StorageMode = 'local' | 'cloud';

interface ActiveProject {
  id: string;
  storageMode: StorageMode;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setShowPasswordReset(hasPasswordRecoveryParams());
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
        setShowAuth(false);
        setActiveProject(null);
        return;
      }

      if (!nextSession) {
        setActiveProject(null);
        setShowPasswordReset(false);
      }

      if (event === 'SIGNED_IN') {
        setShowAuth(false);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <main className="app-shell centered-shell">
        <div className="quiet-loader" aria-label="Loading Ariadne Reader">
          <LabyrinthMark size={56} spinning />
          <span>Opening the archive...</span>
        </div>
      </main>
    );
  }

  const storageMode: StorageMode = session?.user ? 'cloud' : 'local';
  const screenKey = showPasswordReset
    ? 'password-reset'
    : showAuth && !session?.user
    ? 'auth'
    : activeProject
      ? `reader:${activeProject.id}`
      : 'dashboard';

  return (
    <main className="app-shell">
      <StatueLineBackdrop />

      <header className="global-header">
        <button
          className="wordmark-button"
          type="button"
          onClick={() => setActiveProject(null)}
          aria-label="Return to dashboard"
        >
          <LabyrinthMark size={36} />
          <span>
            <strong>Ariadne Reader</strong>
          </span>
        </button>

        {session?.user ? (
          <button
            className="icon-text-button subtle"
            type="button"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        ) : (
          <button className="icon-text-button subtle" type="button" onClick={() => setShowAuth(true)}>
            Sign in
          </button>
        )}
      </header>

      <div className="screen-fade" key={screenKey}>
        {showPasswordReset ? (
          <AuthScreen
            initialMode="update-password"
            onPasswordUpdated={() => {
              clearAuthRedirectUrl();
              setShowPasswordReset(false);
            }}
          />
        ) : showAuth && !session?.user ? (
          <AuthScreen onCancel={() => setShowAuth(false)} />
        ) : activeProject ? (
          <PdfReader
            projectId={activeProject.id}
            storageMode={activeProject.storageMode}
            onBack={() => setActiveProject(null)}
          />
        ) : (
          <Dashboard
            user={session?.user ?? null}
            storageMode={storageMode}
            onOpenProject={(projectId) => setActiveProject({ id: projectId, storageMode })}
            onSignIn={() => setShowAuth(true)}
          />
        )}
      </div>
    </main>
  );
}

function hasPasswordRecoveryParams() {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const queryParams = new URLSearchParams(window.location.search);

  return hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';
}

function clearAuthRedirectUrl() {
  window.history.replaceState(null, document.title, new URL('/', window.location.origin));
}
