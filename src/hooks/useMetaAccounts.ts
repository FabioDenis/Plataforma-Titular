import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../hooks/useOrganization';
import {
  MetaConnectionStatus,
  PublicationRecord,
  AdministeredPageItem,
  HermesUserRole,
} from '../types';

export function useMetaAccounts() {
  const { user, authFetch, billingProfile } = useAuth();
  const { organization } = useOrganization();
  const orgId = organization?.id || (user ? `org_${user.uid}` : null);

  const [status, setStatus] = useState<MetaConnectionStatus>({
    isConfiguredOnServer: false,
    facebook: { connected: false },
    instagram: { connected: false },
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [availablePages, setAvailablePages] = useState<AdministeredPageItem[]>([]);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [isSelectingPage, setIsSelectingPage] = useState<boolean>(false);
  const [isSavingPage, setIsSavingPage] = useState<boolean>(false);
  const [history, setHistory] = useState<PublicationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Frontend is not a source of truth for authorization; the backend enforces the final decision.
  const userRole: HermesUserRole = billingProfile?.isAdmin ? 'admin' : 'owner';
  const canManageConnections = Boolean(user);

  // Fetch connection status
  const fetchStatus = useCallback(async () => {
    if (!orgId || !user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await authFetch(`/api/meta/status?orgId=${encodeURIComponent(orgId)}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err: any) {
      console.warn('Error al verificar estado de cuentas Meta:', err);
    } finally {
      setLoading(false);
    }
  }, [orgId, user, authFetch]);

  // Fetch publication history (read-only logs)
  const fetchHistory = useCallback(async () => {
    if (!orgId || !user) return;
    try {
      setHistoryLoading(true);
      const res = await authFetch(`/api/meta/history?orgId=${encodeURIComponent(orgId)}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.publications || []);
      }
    } catch (err: any) {
      console.warn('Error al obtener historial de publicaciones:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [orgId, user, authFetch]);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
  }, [fetchStatus, fetchHistory]);

  // Listen to postMessage from OAuth popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        origin !== window.location.origin
      ) {
        return;
      }

      if (event.data?.type === 'META_PAGES_AVAILABLE') {
        setIsConnecting(false);
        const pages: AdministeredPageItem[] = event.data.pages || [];
        const sKey: string = event.data.sessionKey;

        if (pages.length === 0) {
          setError('No se encontraron páginas de Facebook administradas por esta cuenta.');
          return;
        }

        setAvailablePages(pages);
        setSessionKey(sKey);
        setIsSelectingPage(true);
        setError(null);
      } else if (event.data?.type === 'META_AUTH_SUCCESS') {
        setIsConnecting(false);
        fetchStatus();
        setSuccessMessage('Conexión con Meta realizada con éxito.');
      } else if (event.data?.type === 'META_AUTH_ERROR') {
        setIsConnecting(false);
        setError(event.data.error || 'La autorización con Meta fue cancelada o denegada.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchStatus]);

  // Connect Meta Accounts via Official OAuth Popup
  const connect = useCallback(async () => {
    if (!orgId) return;
    if (!canManageConnections) {
      setError('Permisos insuficientes: Solo los administradores pueden conectar redes sociales.');
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsConnecting(true);

    try {
      const res = await authFetch(`/api/meta/oauth/url?orgId=${encodeURIComponent(orgId)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || errData.userMessage || 'Error al obtener URL de autorización');
      }

      const { url } = await res.json();

      // Open official Meta dialog in popup
      const width = 640;
      const height = 750;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        url,
        'meta_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},toolbar=0,scrollbars=1,status=1,resizable=1`
      );

      if (!popup) {
        setIsConnecting(false);
        setError('El navegador bloqueó la ventana emergente. Por favor habilita ventanas emergentes para conectar tu cuenta.');
      }
    } catch (err: any) {
      setIsConnecting(false);
      setError(err.message || 'Error al iniciar conexión con Meta.');
    }
  }, [orgId, authFetch, canManageConnections]);

  // Confirm selection of Facebook page and linked Instagram account
  const selectPage = useCallback(
    async (pageId: string) => {
      if (!orgId || !sessionKey) return false;
      try {
        setIsSavingPage(true);
        setError(null);
        const res = await authFetch('/api/meta/select-page', {
          method: 'POST',
          body: JSON.stringify({ orgId, sessionKey, selectedPageId: pageId }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Error al vincular la página seleccionada.');
        }

        const data = await res.json();
        if (data.status) {
          setStatus(data.status);
        } else {
          await fetchStatus();
        }

        setIsSelectingPage(false);
        setAvailablePages([]);
        setSessionKey(null);
        setSuccessMessage('¡Redes sociales vinculadas exitosamente con la institución!');
        return true;
      } catch (err: any) {
        setError(err.message || 'Error al vincular la página.');
        return false;
      } finally {
        setIsSavingPage(false);
      }
    },
    [orgId, sessionKey, authFetch, fetchStatus]
  );

  // Cancel page selection dialog
  const cancelPageSelection = useCallback(() => {
    setIsSelectingPage(false);
    setAvailablePages([]);
    setSessionKey(null);
  }, []);

  // Disconnect accounts
  const disconnect = useCallback(
    async (platform: 'all' | 'facebook' | 'instagram' = 'all') => {
      if (!orgId) return;
      if (!canManageConnections) {
        setError('Permisos insuficientes: Solo los administradores pueden desconectar redes sociales.');
        return;
      }
      try {
        setLoading(true);
        setError(null);
        setSuccessMessage(null);
        const res = await authFetch('/api/meta/disconnect', {
          method: 'POST',
          body: JSON.stringify({ orgId, platform }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Error al desconectar cuenta');
        }
        await fetchStatus();
        setSuccessMessage('Cuenta desconectada correctamente.');
      } catch (err: any) {
        setError(err.message || 'Error al desconectar redes sociales.');
      } finally {
        setLoading(false);
      }
    },
    [orgId, authFetch, fetchStatus, canManageConnections]
  );

  // Publish approved content to Meta
  const publish = useCallback(
    async (payload: any) => {
      const res = await authFetch('/api/meta/publish', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al publicar en redes sociales.');
      }
      await fetchHistory();
      return data;
    },
    [authFetch, fetchHistory]
  );

  // Retry failed platform publish
  const retry = useCallback(
    async (publicationId: string, platform: 'facebook' | 'instagram') => {
      const res = await authFetch('/api/meta/publish/retry', {
        method: 'POST',
        body: JSON.stringify({ publicationId, platform, orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al reintentar publicación.');
      }
      await fetchHistory();
      return data;
    },
    [authFetch, fetchHistory, orgId]
  );

  const clearError = () => setError(null);
  const clearSuccess = () => setSuccessMessage(null);

  return {
    status,
    loading,
    isConnecting,
    isSelectingPage,
    isSavingPage,
    availablePages,
    error,
    successMessage,
    clearError,
    clearSuccess,
    connect,
    selectPage,
    cancelPageSelection,
    disconnect,
    publish,
    retry,
    history,
    historyLoading,
    refreshStatus: fetchStatus,
    canManageConnections,
    userRole,
  };
}
