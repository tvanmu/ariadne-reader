import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogIn, LogOut } from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import LabyrinthMark from './components/LabyrinthMark';
import PdfReader from './components/PdfReader';

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
      setShowAuth(false);
      if (!nextSession) {
        setActiveProject(null);
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
  const screenKey = showAuth && !session?.user
    ? 'auth'
    : activeProject
      ? `reader:${activeProject.id}`
      : 'dashboard';

  return (
    <main className="app-shell">
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
            <small>A clear path through dense PDFs.</small>
          </span>
        </button>

        {session?.user ? (
          <button
            className="icon-text-button subtle"
            type="button"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut size={16} />
            Sign out
          </button>
        ) : (
          <button className="icon-text-button subtle" type="button" onClick={() => setShowAuth(true)}>
            <LogIn size={16} />
            Sign in to sync
          </button>
        )}
      </header>

      <div className="screen-fade" key={screenKey}>
        {showAuth && !session?.user ? (
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
