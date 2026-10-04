import React, { useState } from 'react';
import { X, Mail, Lock, UserPlus, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_TRIAL_PUBLICATION_LIMIT } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { loginWithEmail, registerWithEmail } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Por favor completá todos los campos.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        await registerWithEmail(email.trim(), password);
      } else {
        await loginWithEmail(email.trim(), password);
      }
      onClose();
      setEmail('');
      setPassword('');
    } catch (err: any) {
      console.error('Auth error:', err);
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setError('Este correo electrónico ya se encuentra registrado. Probá iniciando sesión.');
      } else if (code === 'auth/weak-password') {
        setError('La contraseña es demasiado débil. Debe tener al menos 6 caracteres.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setError('Correo electrónico o contraseña incorrectos.');
      } else if (code === 'auth/network-request-failed') {
        setError('Error de red. Verificá tu conexión a internet e intentá nuevamente.');
      } else if (code === 'auth/invalid-email') {
        setError('El correo electrónico no tiene un formato válido.');
      } else {
        setError(err.message || 'Error al autenticar. Intentá nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md rounded-2xl border border-brand-navy/15 bg-white p-6 shadow-raised">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-navy/60 hover:bg-brand-navy/10 hover:text-brand-ink transition-all cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary-soft text-brand-primary-deep border border-brand-primary/30">
            {isRegister ? <UserPlus className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}
          </div>
          <h2 className="text-xl font-bold text-brand-ink">
            {isRegister ? 'Crear Cuenta en Titular' : 'Iniciar Sesión'}
          </h2>
          <p className="mt-1 text-xs text-brand-navy/60">
            {isRegister
              ? `Registrate para recibir ${DEFAULT_TRIAL_PUBLICATION_LIMIT} publicaciones de prueba gratuitas`
              : 'Ingresá a tu cuenta para gestionar tus publicaciones y plan mensual'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-brand-navy/80">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-brand-navy/50" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="redaccion@elmedio.com"
                required
                className="w-full rounded-xl border border-brand-navy/15 bg-brand-navy/5 py-2.5 pl-9 pr-3 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-brand-navy/80">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-brand-navy/50" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-xl border border-brand-navy/15 bg-brand-navy/5 py-2.5 pl-9 pr-3 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-primary py-2.5 text-xs font-bold text-brand-ink transition-all hover:bg-brand-primary-hover disabled:opacity-50 cursor-pointer shadow-lg flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-ink border-t-transparent" />
            ) : isRegister ? (
              'Crear Cuenta y Comenzar'
            ) : (
              'Iniciar Sesión'
            )}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-5 text-center text-xs text-brand-navy/60">
          {isRegister ? (
            <p>
              ¿Ya tenés una cuenta?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setError(null);
                }}
                className="font-semibold text-brand-primary-deep hover:underline cursor-pointer"
              >
                Iniciar sesión
              </button>
            </p>
          ) : (
            <p>
              ¿No tenés cuenta aún?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setError(null);
                }}
                className="font-semibold text-brand-primary-deep hover:underline cursor-pointer"
              >
                Registrate acá
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
