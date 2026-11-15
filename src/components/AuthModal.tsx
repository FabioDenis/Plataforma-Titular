import React, { useState } from 'react';
import { X, Mail, Lock, LogIn, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Access to Titular is by invitation: there is no public sign-up. Invited people create their
 * password from the emailed link, or request it again here.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'login' | 'password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { loginWithEmail, sendPasswordSetupEmail } = useAuth();

  if (!isOpen) return null;

  const switchMode = (next: 'login' | 'password') => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const describeError = (err: any) => {
    const code = err?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
      return 'Correo electrónico o contraseña incorrectos. Si todavía no creaste tu contraseña, usá "Crear o recuperar contraseña".';
    }
    if (code === 'auth/network-request-failed') return 'Error de red. Verificá tu conexión a internet e intentá nuevamente.';
    if (code === 'auth/invalid-email') return 'El correo electrónico no tiene un formato válido.';
    if (code === 'auth/too-many-requests') return 'Demasiados intentos. Esperá unos minutos e intentá nuevamente.';
    return 'No pudimos completar la operación. Intentá nuevamente.';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Por favor completá todos los campos.');
      return;
    }
    setLoading(true);
    try {
      await loginWithEmail(email.trim(), password);
      onClose();
      setEmail('');
      setPassword('');
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email) {
      setError('Ingresá el correo con el que te invitaron.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordSetupEmail(email);
      // Neutral on purpose: never reveal whether an address has an account.
      setNotice(`Si ${email.trim()} tiene acceso a Titular, te llegará un email con un enlace para crear tu contraseña.`);
    } catch (err: any) {
      console.error('Password email error:', err);
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-brand-navy/15 bg-brand-navy/5 py-2.5 pl-9 pr-3 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-brand-navy/15 bg-white p-6 shadow-raised">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-navy/60 hover:bg-brand-navy/10 hover:text-brand-ink transition-all cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary-soft text-brand-primary-deep border border-brand-primary/30">
            {mode === 'login' ? <LogIn className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </div>
          <h2 className="text-xl font-bold text-brand-ink">
            {mode === 'login' ? 'Iniciar Sesión' : 'Crear o recuperar contraseña'}
          </h2>
          <p className="mt-1 text-xs text-brand-navy/60">
            {mode === 'login'
              ? 'El acceso a Titular es por invitación de tu medio.'
              : 'Te enviamos un enlace al correo con el que tu medio te invitó.'}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={mode === 'login' ? handleLogin : handlePasswordEmail} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-xs font-semibold text-brand-navy/80">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-brand-navy/50" />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="redaccion@elmedio.com"
                autoComplete="email"
                required
                className={inputClass}
              />
            </div>
          </div>

          {mode === 'login' && (
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-xs font-semibold text-brand-navy/80">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-brand-navy/50" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-primary py-2.5 text-xs font-bold text-brand-ink transition-all hover:bg-brand-primary-hover disabled:opacity-50 cursor-pointer shadow-lg flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-ink border-t-transparent" />
            ) : mode === 'login' ? (
              'Iniciar Sesión'
            ) : (
              'Enviarme el enlace'
            )}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-brand-navy/60">
          {mode === 'login' ? (
            <button
              type="button"
              onClick={() => switchMode('password')}
              className="font-semibold text-brand-primary-deep hover:underline cursor-pointer"
            >
              Crear o recuperar contraseña
            </button>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="font-semibold text-brand-primary-deep hover:underline cursor-pointer"
            >
              Volver a iniciar sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
