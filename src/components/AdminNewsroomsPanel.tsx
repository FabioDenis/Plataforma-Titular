import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Search,
  Plus,
  RefreshCw,
  Building2,
  Palette,
  Power,
  PauseCircle,
  PlayCircle,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OrganizationMembersPanel } from './OrganizationMembersPanel';
import { describeTotalCost, summarizeNewsrooms } from '../utils/newsroomTotals';
import { parseSeatLimitInput } from '../utils/teamSeats';

type NewsroomStatus = 'draft' | 'active' | 'suspended';

interface Consumption {
  publications: number;
  totalTokens: number;
  totalCostUsd: number | null;
}

interface NewsroomRow {
  id: string;
  name: string;
  status: NewsroomStatus;
  ownerEmail: string;
  membersCount: number;
  pendingInvites: number;
  /** Null when the newsroom has no seat limit. */
  seatLimit: number | null;
  /** Owner, members and pending invites. */
  seatsUsed: number;
  managerEmail: string;
  createdAt: string;
  lastGenerationAt: string | null;
  totalPublications: number;
  month: Consumption;
}

interface MonthlyUsage extends Consumption {
  month: string;
}

interface AdminNewsroomsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the admin opened a newsroom, to show its identity and template screens. */
  onOpenOrganization?: () => void;
}

const STATUS_LABEL: Record<NewsroomStatus, string> = {
  draft: 'En preparación',
  active: 'Activo',
  suspended: 'Suspendido',
};

const STATUS_CLASS: Record<NewsroomStatus, string> = {
  draft: 'bg-amber-50 text-amber-800 border-amber-200',
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  suspended: 'bg-rose-50 text-rose-800 border-rose-200',
};

const numberFormat = new Intl.NumberFormat('es-AR');
const usdFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function formatCost(cost: number | null) {
  return cost === null ? '—' : usdFormat.format(cost);
}

function formatDate(value: string | null) {
  if (!value) return 'Sin actividad';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function monthLabel(month: string) {
  const [year, m] = month.split('-').map(Number);
  const label = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function recentMonths(count: number) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/**
 * Platform admin panel organized by newsroom: create and prepare newsrooms, move them through
 * their lifecycle, manage each team, and compare AI consumption across newsrooms.
 */
export const AdminNewsroomsPanel: React.FC<AdminNewsroomsPanelProps> = ({ isOpen, onClose, onOpenOrganization }) => {
  const { authFetch } = useAuth();
  const months = useMemo(() => recentMonths(6), []);

  const [month, setMonth] = useState(months[0]);
  const [newsrooms, setNewsrooms] = useState<NewsroomRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSeatLimit, setNewSeatLimit] = useState('');
  const [seatLimitDraft, setSeatLimitDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<MonthlyUsage[] | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const [usageAttempt, setUsageAttempt] = useState(0);
  // Only the latest list request may update the panel, so a slow answer for a month the admin
  // already left never replaces the selected month.
  const latestListRequest = useRef(0);

  const readJson = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || fallback);
    return data;
  };

  const loadNewsrooms = useCallback(async () => {
    const request = ++latestListRequest.current;
    const isLatest = () => request === latestListRequest.current;
    try {
      setLoading(true);
      setError(null);
      const data = await readJson(
        await authFetch(`/api/admin/organizations?month=${encodeURIComponent(month)}`),
        'No se pudieron cargar los medios.'
      );
      if (isLatest()) setNewsrooms(data.organizations || []);
    } catch (err: any) {
      if (isLatest()) setError(err.message);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [authFetch, month]);

  useEffect(() => {
    if (isOpen) loadNewsrooms();
  }, [isOpen, loadNewsrooms]);

  const selected = newsrooms.find((n) => n.id === selectedId) || null;

  // The seat limit field shows the selected newsroom's current limit.
  useEffect(() => {
    setSeatLimitDraft(selected?.seatLimit ? String(selected.seatLimit) : '');
  }, [selected?.id, selected?.seatLimit]);

  useEffect(() => {
    setUsage(null);
    setUsageFailed(false);
    if (!isOpen || !selectedId) return;
    let cancelled = false;
    authFetch(`/api/admin/organizations/${encodeURIComponent(selectedId)}/usage`)
      .then((res) => readJson(res, 'No se pudo cargar el consumo.'))
      .then((data) => !cancelled && setUsage(data.usage || []))
      .catch(() => !cancelled && setUsageFailed(true));
    return () => {
      cancelled = true;
    };
  }, [authFetch, isOpen, selectedId, usageAttempt]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return newsrooms;
    return newsrooms.filter((n) => n.name.toLowerCase().includes(term) || n.ownerEmail.toLowerCase().includes(term));
  }, [newsrooms, search]);

  const totals = useMemo(() => summarizeNewsrooms(newsrooms), [newsrooms]);

  if (!isOpen) return null;

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (err: any) {
      setError(err.message || 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    run(async () => {
      const seatLimit = parseSeatLimitInput(newSeatLimit);
      if (seatLimit === 'invalid') throw new Error('El cupo debe ser un número entero entre 1 y 1000, o vacío para no tener cupo.');
      const data = await readJson(
        await authFetch('/api/admin/organizations', { method: 'POST', body: JSON.stringify({ name, seatLimit }) }),
        'No se pudo crear el medio.'
      );
      setNewName('');
      setNewSeatLimit('');
      await loadNewsrooms();
      setSelectedId(data.organizationId);
      return `"${name}" creado en preparación. Cargá su identidad y plantillas, activalo, sumá las cuentas del cliente y elegí a su responsable.`;
    });
  };

  const handleSeatLimit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    run(async () => {
      const seatLimit = parseSeatLimitInput(seatLimitDraft);
      if (seatLimit === 'invalid') throw new Error('El cupo debe ser un número entero entre 1 y 1000, o vacío para no tener cupo.');
      await readJson(
        await authFetch(`/api/admin/organizations/${encodeURIComponent(selected.id)}/seat-limit`, {
          method: 'POST',
          body: JSON.stringify({ seatLimit }),
        }),
        'No se pudo cambiar el cupo del medio.'
      );
      await loadNewsrooms();
      return seatLimit === null
        ? `${selected.name} quedó sin cupo de cuentas.`
        : `El cupo de ${selected.name} ahora es de ${seatLimit} ${seatLimit === 1 ? 'cuenta' : 'cuentas'}. Nadie pierde el acceso si ya hay más.`;
    });
  };

  const handleStatus = (status: NewsroomStatus) =>
    selected &&
    run(async () => {
      await readJson(
        await authFetch(`/api/admin/organizations/${encodeURIComponent(selected.id)}/status`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        }),
        'No se pudo cambiar el estado del medio.'
      );
      await loadNewsrooms();
      return status === 'active'
        ? `${selected.name} está activo: su equipo ya puede generar publicaciones.`
        : `${selected.name} quedó suspendido: su equipo no puede generar hasta que lo reactives.`;
    });

  const handleOpen = () =>
    selected &&
    run(async () => {
      await readJson(
        await authFetch(`/api/admin/organizations/${encodeURIComponent(selected.id)}/enter`, { method: 'POST' }),
        'No se pudo abrir el medio.'
      );
      onClose();
      onOpenOrganization?.();
      return '';
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-ink/40 p-2 sm:p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-brand-navy/15 bg-white shadow-raised">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-navy/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-primary/30 bg-brand-primary-soft text-brand-primary-deep">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brand-ink">Administración de medios</h2>
              <p className="text-xs text-brand-navy/60">
                {newsrooms.length} medios · {totals.active} activos · {numberFormat.format(totals.publications)} publicaciones en{' '}
                {monthLabel(month).toLowerCase()} · costo {describeTotalCost(totals, usdFormat.format)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="admin-month" className="sr-only">Mes de consumo</label>
            <select
              id="admin-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-ink"
            >
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadNewsrooms}
              aria-label="Actualizar"
              className="rounded-lg border border-brand-navy/15 p-1.5 text-brand-navy/70 hover:bg-brand-navy/5"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-brand-navy/60 hover:bg-brand-navy/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {(error || notice) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`mx-5 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {error ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>{error || notice}</span>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Newsroom list */}
          <aside className="flex min-h-0 flex-col border-b border-brand-navy/10 md:w-[22rem] md:border-b-0 md:border-r">
            <form onSubmit={handleCreate} className="flex flex-wrap gap-2 border-b border-brand-navy/10 p-3">
              <label htmlFor="admin-new-newsroom" className="sr-only">Nombre del nuevo medio</label>
              <input
                id="admin-new-newsroom"
                type="text"
                required
                maxLength={120}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del nuevo medio"
                className="min-w-0 flex-1 rounded-lg border border-brand-navy/15 px-3 py-2 text-xs focus:border-brand-primary focus:outline-none"
              />
              <label htmlFor="admin-new-seat-limit" className="sr-only">Cupo de cuentas (opcional)</label>
              <input
                id="admin-new-seat-limit"
                type="number"
                min={1}
                max={1000}
                step={1}
                value={newSeatLimit}
                onChange={(e) => setNewSeatLimit(e.target.value)}
                placeholder="Cupo"
                title="Cupo de cuentas (opcional). Vacío: sin cupo."
                className="w-20 rounded-lg border border-brand-navy/15 px-2 py-2 text-xs focus:border-brand-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-navy px-3 py-2 text-xs font-medium text-white hover:bg-brand-navy/90 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Crear medio
              </button>
            </form>
            <div className="relative p-3 pb-2">
              <Search className="absolute left-6 top-5 h-3.5 w-3.5 text-brand-navy/40" />
              <label htmlFor="admin-search" className="sr-only">Buscar medio</label>
              <input
                id="admin-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por medio o email"
                className="w-full rounded-lg border border-brand-navy/15 py-2 pl-8 pr-3 text-xs focus:border-brand-primary focus:outline-none"
              />
            </div>
            <p className="px-4 pb-1 text-[11px] text-brand-navy/50">Ordenados por consumo de {monthLabel(month).toLowerCase()}</p>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 max-h-64 md:max-h-none">
              {loading && newsrooms.length === 0 ? (
                <li className="p-6 text-center text-xs text-brand-navy/50">Cargando medios…</li>
              ) : filtered.length === 0 ? (
                <li className="p-6 text-center text-xs text-brand-navy/50">No hay medios que coincidan.</li>
              ) : (
                filtered.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(n.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        n.id === selectedId ? 'border-brand-primary bg-brand-primary-soft/40' : 'border-brand-navy/10 hover:bg-brand-navy/5'
                      }`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words text-sm font-semibold text-brand-ink">{n.name}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[n.status]}`}>
                          {STATUS_LABEL[n.status]}
                        </span>
                      </span>
                      <span className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-brand-navy/60">
                        <span>
                          <strong className="block font-mono text-xs text-brand-ink tabular-nums">{numberFormat.format(n.month.publications)}</strong>
                          publicaciones
                        </span>
                        <span>
                          <strong className="block font-mono text-xs text-brand-ink tabular-nums">{formatCost(n.month.totalCostUsd)}</strong>
                          costo
                        </span>
                        <span>
                          <strong className="block font-mono text-xs text-brand-ink tabular-nums">
                            {n.seatLimit === null ? n.seatsUsed : `${n.seatsUsed}/${n.seatLimit}`}
                          </strong>
                          {n.seatLimit === null ? 'cuentas' : 'cupo'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </aside>

          {/* Newsroom detail */}
          <section className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
            {!selected ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-brand-navy/50">
                <Building2 className="h-8 w-8" />
                <p>Elegí un medio de la lista o creá uno nuevo.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-xl border border-brand-navy/15 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-bold text-brand-ink">{selected.name}</h3>
                      <p className="mt-1 text-xs text-brand-navy/60">
                        Creado {formatDate(selected.createdAt)} · Última publicación {formatDate(selected.lastGenerationAt)} ·{' '}
                        {numberFormat.format(selected.totalPublications)} publicaciones en total
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[selected.status]}`}>
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-brand-navy/70">
                    {selected.status === 'draft' &&
                      'En preparación: cargá su identidad y plantillas. El equipo puede entrar, pero no genera publicaciones hasta que lo actives.'}
                    {selected.status === 'active' && 'Activo: su equipo genera publicaciones con tu saldo de IA.'}
                    {selected.status === 'suspended' &&
                      'Suspendido: su equipo no puede generar publicaciones. Los datos se conservan.'}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleOpen}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-navy/20 px-3 py-2 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 disabled:opacity-50"
                    >
                      <Palette className="h-3.5 w-3.5" /> Editar identidad y plantillas
                    </button>
                    {selected.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => handleStatus('active')}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Power className="h-3.5 w-3.5" /> Dar de alta (activar)
                      </button>
                    )}
                    {selected.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => handleStatus('suspended')}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <PauseCircle className="h-3.5 w-3.5" /> Suspender
                      </button>
                    )}
                    {selected.status === 'suspended' && (
                      <button
                        type="button"
                        onClick={() => handleStatus('active')}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <PlayCircle className="h-3.5 w-3.5" /> Reactivar
                      </button>
                    )}
                  </div>
                </div>

                <form onSubmit={handleSeatLimit} className="rounded-xl border border-brand-navy/15 p-5">
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-navy/80">
                    <Users className="h-3.5 w-3.5" /> Cupo y responsable
                  </h4>
                  <p className="mt-1 text-xs text-brand-navy/60">
                    {selected.managerEmail
                      ? `Responsable: ${selected.managerEmail}. Puede invitar y quitar cuentas hasta llenar el cupo.`
                      : 'Sin responsable: elegilo en el equipo con "Hacer responsable" para que gestione sus cuentas.'}{' '}
                    El cupo cuenta al responsable, las cuentas activas y las invitaciones pendientes.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label htmlFor="admin-seat-limit" className="text-xs text-brand-navy/80">Cupo de cuentas</label>
                    <input
                      id="admin-seat-limit"
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      value={seatLimitDraft}
                      onChange={(e) => setSeatLimitDraft(e.target.value)}
                      placeholder="Sin cupo"
                      className="w-24 rounded-lg border border-brand-navy/15 px-2 py-1.5 text-xs focus:border-brand-primary focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg border border-brand-navy/20 px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/5 disabled:opacity-50"
                    >
                      Guardar cupo
                    </button>
                    <span className="text-[11px] text-brand-navy/50">Vacío: sin cupo.</span>
                  </div>
                </form>

                <OrganizationMembersPanel
                  orgId={selected.id}
                  orgName={selected.name}
                  authFetch={authFetch}
                  onChanged={loadNewsrooms}
                />

                <div className="rounded-xl border border-brand-navy/15 p-5">
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-navy/80">
                    <BarChart3 className="h-3.5 w-3.5" /> Consumo mensual
                  </h4>
                  {usageFailed ? (
                    <div className="mt-3 flex items-center gap-3 text-xs text-rose-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>No se pudo cargar el consumo.</span>
                      <button
                        type="button"
                        onClick={() => setUsageAttempt((attempt) => attempt + 1)}
                        className="rounded-lg border border-brand-navy/15 px-2.5 py-1 font-medium text-brand-ink hover:bg-brand-navy/5"
                      >
                        Reintentar
                      </button>
                    </div>
                  ) : usage === null ? (
                    <p className="mt-3 text-xs text-brand-navy/50">Cargando consumo…</p>
                  ) : usage.length === 0 ? (
                    <p className="mt-3 text-xs text-brand-navy/50">Este medio todavía no generó publicaciones.</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[26rem] text-left text-xs">
                        <thead className="text-[11px] uppercase tracking-wider text-brand-navy/50">
                          <tr>
                            <th className="py-2 pr-3 font-medium">Mes</th>
                            <th className="py-2 pr-3 text-right font-medium">Publicaciones</th>
                            <th className="py-2 pr-3 text-right font-medium">Tokens</th>
                            <th className="py-2 text-right font-medium">Costo estimado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-navy/10 font-mono tabular-nums text-brand-ink">
                          {usage.map((u) => (
                            <tr key={u.month}>
                              <td className="py-2 pr-3 font-sans">{monthLabel(u.month)}</td>
                              <td className="py-2 pr-3 text-right">{numberFormat.format(u.publications)}</td>
                              <td className="py-2 pr-3 text-right">{numberFormat.format(u.totalTokens)}</td>
                              <td className="py-2 text-right">{formatCost(u.totalCostUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-brand-navy/50">
                    <Users className="h-3 w-3" /> Todas las cuentas del medio consumen de tu saldo único de IA.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
