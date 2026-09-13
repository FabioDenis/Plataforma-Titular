import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  Plus,
  Shield,
  ShieldCheck,
  RefreshCw,
  Calendar,
  Building2,
  Mail,
  History,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../context/OrganizationContext';
import { AdminUserRecord, GenerationMovement } from '../types';

interface AdminGenerationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminGenerationsModal: React.FC<AdminGenerationsModalProps> = ({ isOpen, onClose }) => {
  const { authFetch, refreshBillingProfile, user: currentUser } = useAuth();
  const orgContext = useOrganization();

  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add Generations Form State
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [addAmount, setAddAmount] = useState<number>(50);
  const [addReason, setAddReason] = useState<string>('');
  const [submittingAdd, setSubmittingAdd] = useState<boolean>(false);

  // History State
  const [history, setHistory] = useState<GenerationMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Toggle Admin State
  const [togglingAdmin, setTogglingAdmin] = useState<boolean>(false);

  // Fetch all users
  const fetchUsers = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);
      setError(null);

      const res = await authFetch('/api/admin/users');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Acceso denegado: se requieren privilegios de administrador.');
        }
        throw new Error('Error al cargar la lista de usuarios.');
      }

      const data = await res.json();
      const list: AdminUserRecord[] = data.users || [];
      setUsers(list);

      // Auto-select first user if none selected
      setSelectedUserId((prev) => {
        if (prev && list.some((u) => u.uid === prev)) return prev;
        return list[0]?.uid || null;
      });
    } catch (err: any) {
      console.error('Error fetching admin users:', err);
      setError(err.message || 'No fue posible cargar los usuarios.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]);

  // Selected user record
  const selectedUser = useMemo(() => {
    return users.find((u) => u.uid === selectedUserId) || null;
  }, [users, selectedUserId]);

  // Fetch generation history for selected user's organization
  const fetchHistory = useCallback(async (orgId: string) => {
    if (!orgId) return;
    try {
      setLoadingHistory(true);
      const res = await authFetch(`/api/admin/users/${encodeURIComponent(orgId)}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.warn('Error fetching org history:', err);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [authFetch]);

  // Load users on modal open
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    } else {
      setIsAddOpen(false);
      setSuccessMessage(null);
      setError(null);
    }
  }, [isOpen, fetchUsers]);

  // Load history when selected user changes
  useEffect(() => {
    if (selectedUser?.organizationId) {
      fetchHistory(selectedUser.organizationId);
      setIsAddOpen(false);
      setAddAmount(50);
      setAddReason('');
    } else {
      setHistory([]);
    }
  }, [selectedUser?.organizationId, fetchHistory]);

  // Filtered users by search term
  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const emailMatch = u.email.toLowerCase().includes(q);
      const orgMatch = u.organizationName.toLowerCase().includes(q);
      const uidMatch = u.uid.toLowerCase().includes(q);
      return emailMatch || orgMatch || uidMatch;
    });
  }, [users, searchTerm]);

  // Handle Add Generations submission
  const handleConfirmAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    const amount = Number(addAmount);
    if (!amount || isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
      setError('Por favor ingresa un número entero positivo de generaciones.');
      return;
    }

    try {
      setSubmittingAdd(true);
      setError(null);

      const res = await authFetch('/api/admin/users/add-generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetOrgId: selectedUser.organizationId,
          targetUid: selectedUser.uid,
          amount,
          reason: addReason.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al agregar generaciones.');
      }

      const data = await res.json();

      // Update user locally
      setUsers((prev) =>
        prev.map((u) => {
          if (u.uid === selectedUser.uid) {
            return {
              ...u,
              publicationLimit: data.newPublicationLimit,
              publicationUsed: data.publicationUsed,
              availableGenerations: data.availableGenerations,
            };
          }
          return u;
        })
      );

      // If updating current active org, trigger refresh
      if (selectedUser.organizationId === orgContext?.organization?.id) {
        if (orgContext?.reload) orgContext.reload().catch(() => {});
        refreshBillingProfile().catch(() => {});
      }

      setSuccessMessage(
        `Se agregaron exitosamente +${amount} generaciones a ${selectedUser.organizationName}. Saldo nuevo: ${data.availableGenerations} disponibles.`
      );

      setIsAddOpen(false);
      setAddReason('');
      setAddAmount(50);

      // Refresh history list
      fetchHistory(selectedUser.organizationId);

      // Auto-clear success message
      setTimeout(() => {
        setSuccessMessage(null);
      }, 6000);
    } catch (err: any) {
      console.error('Error submitting add generations:', err);
      setError(err.message || 'No fue posible agregar las generaciones.');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Handle Toggle Admin
  const handleToggleAdmin = async () => {
    if (!selectedUser) return;
    const targetIsAdmin = !selectedUser.isAdmin;

    try {
      setTogglingAdmin(true);
      setError(null);

      const res = await authFetch('/api/admin/users/toggle-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUid: selectedUser.uid,
          makeAdmin: targetIsAdmin,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al actualizar permisos de administrador.');
      }

      setUsers((prev) =>
        prev.map((u) => {
          if (u.uid === selectedUser.uid) {
            return {
              ...u,
              isAdmin: targetIsAdmin,
              role: targetIsAdmin ? 'admin' : 'user',
            };
          }
          return u;
        })
      );

      setSuccessMessage(
        `Permisos actualizados: ${selectedUser.email} ahora ${
          targetIsAdmin ? 'es Administrador' : 'es Usuario Estándar'
        }.`
      );

      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Error toggling admin:', err);
      setError(err.message || 'Error al modificar permisos.');
    } finally {
      setTogglingAdmin(false);
    }
  };

  const formatDate = (val: string | undefined): string => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return val;
    }
  };

  const formatDateTime = (val: string | undefined): string => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return val;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/45 p-3 sm:p-6 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        className="relative w-full max-w-5xl h-[92vh] max-h-[850px] rounded-2xl border border-brand-navy/15 bg-white shadow-raised flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-brand-navy/15 px-5 py-4 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-brand-ink tracking-wide">Administración</h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                  Panel de Control
                </span>
              </div>
              <p className="text-xs text-brand-navy/60">Usuarios y generaciones</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchUsers(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 rounded-lg border border-brand-navy/15 bg-brand-navy/5 px-2.5 py-1.5 text-xs text-brand-navy/80 hover:bg-brand-navy/10 hover:text-brand-ink transition-colors cursor-pointer disabled:opacity-50"
              title="Actualizar datos"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-brand-primary-deep' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-brand-navy/60 hover:bg-white/[0.06] hover:text-brand-ink transition-colors cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Notifications Bar */}
        {error && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs shrink-0">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-600 hover:text-rose-800 cursor-pointer text-xs"
            >
              Descartar
            </button>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-700 text-xs shrink-0 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span className="flex-1">{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-700 cursor-pointer text-xs"
            >
              Entendido
            </button>
          </div>
        )}

        {/* Modal Body: Master-Detail Layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* LEFT COLUMN: Search & Users List */}
          <div className="w-full md:w-80 lg:w-96 border-r border-brand-navy/15 flex flex-col bg-brand-navy/5 shrink-0">
            {/* Search Box */}
            <div className="p-3 border-b border-brand-navy/10 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-navy/60" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por usuario, email o medio..."
                  className="w-full rounded-lg border border-brand-navy/15 bg-white pl-9 pr-3 py-2 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/60 transition-colors"
                />
              </div>
              <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-brand-navy/50">
                <span>Total: {filteredUsers.length} cuentas</span>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="text-brand-primary-deep hover:underline cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* Users Scrollable List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 text-brand-navy/50 gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-brand-primary-deep" />
                  <span className="text-xs">Cargando cuentas...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-brand-navy/50 text-xs px-4 text-center">
                  <User className="h-8 w-8 text-brand-navy/40 mb-2" />
                  <span>No se encontraron usuarios coincidentes</span>
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = u.uid === selectedUserId;
                  const isZero = u.availableGenerations <= 0;
                  return (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => setSelectedUserId(u.uid)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-brand-primary bg-brand-primary-soft shadow-sm'
                          : 'border-brand-navy/10 bg-white hover:bg-brand-navy/5 hover:border-brand-navy/15'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-medium text-xs text-brand-ink truncate flex-1">
                          {u.organizationName}
                        </div>
                        {u.isAdmin && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0"
                            title="Administrador"
                          >
                            <Shield className="h-2.5 w-2.5" />
                            Admin
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-brand-navy/60 truncate mb-2 flex items-center gap-1">
                        <Mail className="h-3 w-3 text-brand-navy/50 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-brand-navy/10">
                        <span className="text-brand-navy/50">
                          Uso: <strong className="text-brand-navy/80 font-mono">{u.publicationUsed}</strong> / {u.publicationLimit}
                        </span>

                        <span
                          className={`font-semibold font-mono px-2 py-0.5 rounded text-[11px] ${
                            isZero
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {u.availableGenerations} disp.
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: User Detail & Generation Ledger */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-white custom-scrollbar">
            {selectedUser ? (
              <div className="p-5 md:p-6 space-y-6">
                {/* User Profile Card */}
                <div className="rounded-xl border border-brand-navy/15 bg-white p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-navy/10 pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-brand-ink tracking-tight">
                          {selectedUser.organizationName}
                        </h3>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          {selectedUser.status || 'Activa'}
                        </span>
                        {selectedUser.isAdmin && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" />
                            Administrador
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brand-navy/60 mt-1 flex items-center gap-2 flex-wrap">
                        <span>Email: <strong className="text-brand-navy">{selectedUser.email}</strong></span>
                        <span className="text-brand-navy/40">•</span>
                        <span>Org ID: <code className="text-brand-navy/60 font-mono text-[11px]">{selectedUser.organizationId}</code></span>
                      </p>
                    </div>

                    {/* Admin Privileges Toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleToggleAdmin}
                        disabled={togglingAdmin}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer disabled:opacity-50 ${
                          selectedUser.isAdmin
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                        title="Activar o desactivar permisos administrativos para esta cuenta"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        <span>
                          {selectedUser.isAdmin ? 'Quitar rol Admin' : 'Hacer Administrador'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-brand-navy/60">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-brand-navy/50" />
                      <span>Registro: <strong className="text-brand-navy">{formatDate(selectedUser.userCreatedAt)}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-brand-navy/50" />
                      <span>Plan: <strong className="text-brand-navy capitalize">{selectedUser.plan}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-brand-navy/50" />
                      <span>Rol: <strong className="text-brand-navy capitalize">{selectedUser.role}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Generaciones Metrics & Main Action */}
                <div className="rounded-xl border border-brand-navy/15 bg-white p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-xs font-semibold text-brand-navy/80 uppercase tracking-wider">
                        Balance de Generaciones
                      </h4>
                      <p className="text-[11px] text-brand-navy/50">
                        Disponibles = Generaciones asignadas - Generaciones utilizadas
                      </p>
                    </div>

                    {/* Primary Action Button */}
                    <button
                      type="button"
                      onClick={() => setIsAddOpen(!isAddOpen)}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer shrink-0 active:scale-95"
                    >
                      <Plus className="h-4 w-4" />
                      <span>+ AGREGAR GENERACIONES</span>
                    </button>
                  </div>

                  {/* 3 Metrics Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    {/* Asignadas */}
                    <div className="p-4 rounded-xl border border-brand-navy/10 bg-brand-navy/5">
                      <p className="text-[11px] font-medium text-brand-navy/60">Generaciones asignadas</p>
                      <div className="text-2xl font-bold font-mono text-brand-ink mt-1">
                        {selectedUser.publicationLimit}
                      </div>
                      <p className="text-[10px] text-brand-navy/50 mt-0.5">Límite total acumulado</p>
                    </div>

                    {/* Utilizadas */}
                    <div className="p-4 rounded-xl border border-brand-navy/10 bg-brand-navy/5">
                      <p className="text-[11px] font-medium text-brand-navy/60">Generaciones utilizadas</p>
                      <div className="text-2xl font-bold font-mono text-brand-navy/80 mt-1">
                        {selectedUser.publicationUsed}
                      </div>
                      <p className="text-[10px] text-brand-navy/50 mt-0.5">Consumos reales registrados</p>
                    </div>

                    {/* Disponibles */}
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                      <p className="text-[11px] font-medium text-emerald-700">Generaciones disponibles</p>
                      <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
                        {selectedUser.availableGenerations}
                      </div>
                      <p className="text-[10px] text-emerald-600/80 mt-0.5">Saldo actual para publicar</p>
                    </div>
                  </div>

                  {/* Inline Form: Add Generations */}
                  {isAddOpen && (
                    <form
                      onSubmit={handleConfirmAdd}
                      className="mt-4 p-4 rounded-xl border border-brand-primary/30 bg-brand-primary-soft space-y-4 animate-fade-in"
                    >
                      <div className="flex items-center justify-between border-b border-brand-navy/10 pb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-brand-primary-deep" />
                          <span className="text-xs font-bold text-brand-ink">
                            Agregar generaciones a {selectedUser.organizationName}
                          </span>
                        </div>
                        <span className="text-xs text-brand-navy/60 font-mono">
                          Saldo actual: {selectedUser.availableGenerations}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Cantidad Input */}
                        <div>
                          <label className="block text-xs font-semibold text-brand-navy/80 mb-1.5">
                            Cantidad:
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={addAmount}
                            onChange={(e) => setAddAmount(Math.max(1, parseInt(e.target.value) || 0))}
                            className="w-full rounded-lg border border-brand-navy/20 bg-white px-3 py-2 text-sm text-brand-ink font-mono focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/60"
                            placeholder="50"
                            required
                          />
                          {/* Quick Pick Buttons */}
                          <div className="flex items-center gap-1.5 mt-2">
                            {[10, 50, 100, 500].map((qty) => (
                              <button
                                key={qty}
                                type="button"
                                onClick={() => setAddAmount(qty)}
                                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                                  addAmount === qty
                                    ? 'bg-brand-primary text-brand-ink font-bold'
                                    : 'bg-brand-navy/5 text-brand-navy/60 hover:bg-white/[0.1] hover:text-brand-ink'
                                }`}
                              >
                                +{qty}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Motivo Opcional */}
                        <div>
                          <label className="block text-xs font-semibold text-brand-navy/80 mb-1.5">
                            Motivo <span className="text-brand-navy/50 font-normal">(opcional)</span>:
                          </label>
                          <input
                            type="text"
                            value={addReason}
                            onChange={(e) => setAddReason(e.target.value)}
                            className="w-full rounded-lg border border-brand-navy/20 bg-white px-3 py-2 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/60"
                            placeholder="Ej. Activación comercial, recarga solicitada..."
                          />
                        </div>
                      </div>

                      {/* Summary Calculation Preview */}
                      <div className="p-3 rounded-lg bg-brand-navy/5 border border-brand-navy/10 text-xs text-brand-navy/60 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span>Asignadas:</span>
                          <span className="font-mono text-brand-navy/80">
                            {selectedUser.publicationLimit}
                          </span>
                          <ArrowRight className="h-3 w-3 text-brand-navy/50" />
                          <span className="font-mono text-emerald-600 font-semibold">
                            {selectedUser.publicationLimit + (Number(addAmount) || 0)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span>Disponibles:</span>
                          <span className="font-mono text-brand-navy/80">
                            {selectedUser.availableGenerations}
                          </span>
                          <ArrowRight className="h-3 w-3 text-brand-navy/50" />
                          <span className="font-mono text-emerald-600 font-semibold">
                            {selectedUser.availableGenerations + (Number(addAmount) || 0)}
                          </span>
                        </div>

                        <div className="text-[11px] text-brand-navy/50">
                          Utilizadas: {selectedUser.publicationUsed} (sin cambios)
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsAddOpen(false)}
                          disabled={submittingAdd}
                          className="px-4 py-2 rounded-lg border border-brand-navy/15 text-xs font-semibold text-brand-navy/80 hover:bg-brand-navy/5 hover:text-brand-ink transition-colors cursor-pointer"
                        >
                          CANCELAR
                        </button>
                        <button
                          type="submit"
                          disabled={submittingAdd || !addAmount || addAmount <= 0}
                          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-brand-ink transition-colors cursor-pointer shadow-md disabled:opacity-50"
                        >
                          {submittingAdd ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>CONFIRMANDO...</span>
                            </>
                          ) : (
                            <span>CONFIRMAR</span>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Section: HISTORIAL DE GENERACIONES */}
                <div className="rounded-xl border border-brand-navy/15 bg-white p-5">
                  <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-brand-navy/60" />
                      <h4 className="text-xs font-bold text-brand-ink uppercase tracking-wider">
                        HISTORIAL DE GENERACIONES
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => fetchHistory(selectedUser.organizationId)}
                      disabled={loadingHistory}
                      className="text-[11px] text-brand-navy/60 hover:text-brand-ink flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`h-3 w-3 ${loadingHistory ? 'animate-spin' : ''}`} />
                      <span>Actualizar historial</span>
                    </button>
                  </div>

                  {loadingHistory ? (
                    <div className="flex items-center justify-center h-28 text-brand-navy/50 text-xs gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-brand-primary-deep" />
                      <span>Cargando movimientos...</span>
                    </div>
                  ) : history.length === 0 ? (
                    <div className="p-6 text-center text-brand-navy/50 text-xs bg-brand-navy/5 rounded-lg border border-brand-navy/10">
                      No hay movimientos registrados en el historial de esta cuenta.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {history.map((mov) => (
                        <div
                          key={mov.id}
                          className="p-3.5 rounded-lg border border-brand-navy/10 bg-brand-navy/5 hover:bg-brand-navy/10 transition-colors text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-emerald-600 font-mono">
                                +{mov.amountAdded} generaciones
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                {mov.type}
                              </span>
                            </div>
                            <span className="text-[11px] text-brand-navy/50">
                              {formatDateTime(mov.createdAt)}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-brand-navy/60 mt-2 pt-2 border-t border-brand-navy/10">
                            <div>
                              <span>Saldo anterior: </span>
                              <strong className="text-brand-navy/80 font-mono">{mov.previousAvailable}</strong>
                              <span className="mx-1.5 text-brand-navy/40">→</span>
                              <span>Saldo nuevo: </span>
                              <strong className="text-emerald-700 font-mono">{mov.newAvailable}</strong>
                            </div>

                            <div>
                              <span>Asignadas: </span>
                              <span className="font-mono text-brand-navy/80">{mov.previousPublicationLimit} → {mov.newPublicationLimit}</span>
                              <span className="mx-2 text-brand-navy/40">•</span>
                              <span>Utilizadas: </span>
                              <span className="font-mono text-brand-navy/80">{mov.publicationUsed}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] text-brand-navy/50 mt-1.5 flex-wrap">
                            <div>
                              Administrador: <strong className="text-brand-navy/80">{mov.adminEmail || mov.adminUid}</strong>
                            </div>
                            {mov.reason && (
                              <div className="text-brand-navy/60 italic">
                                Motivo: "{mov.reason}"
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-brand-navy/50 text-center">
                <Building2 className="h-10 w-10 text-brand-navy/40 mb-3" />
                <p className="text-sm font-medium text-brand-navy/60">Ningún usuario seleccionado</p>
                <p className="text-xs text-brand-navy/50 mt-1">
                  Selecciona una cuenta del listado de la izquierda para ver su detalle y gestionar su saldo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
