import React, { useState, useEffect } from 'react';
import {
  Send,
  Instagram,
  Facebook,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Check,
  Clock,
  ThumbsUp,
  RotateCcw,
  Building2,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  SocialPostsOutput,
  NewsArticleData,
  OutletBranding,
  PublicationLifecycleStatus,
  PublicationRecord,
  NetworkPublishResult,
} from '../types';
import { useMetaAccounts } from '../hooks/useMetaAccounts';
import { useAuth } from '../context/AuthContext';
import { useOrganization } from '../hooks/useOrganization';

interface PublishSectionProps {
  posts: SocialPostsOutput;
  article: NewsArticleData;
  branding: OutletBranding;
  activeFormat?: 'feed' | 'story';
  renderedCardDataUrl?: string | null;
  onOpenSocialSettings?: () => void;
}

export const PublishSection: React.FC<PublishSectionProps> = ({
  posts,
  article,
  branding,
  activeFormat = 'feed',
  renderedCardDataUrl,
  onOpenSocialSettings,
}) => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const {
    status: metaStatus,
    loading: metaLoading,
    connect,
    publish,
    retry,
    history,
  } = useMetaAccounts();

  // Lifecycle status
  const [lifecycleStatus, setLifecycleStatus] = useState<PublicationLifecycleStatus>('BORRADOR');
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);

  // Platform selection checkboxes
  const [targetFacebook, setTargetFacebook] = useState<boolean>(true);
  const [targetInstagram, setTargetInstagram] = useState<boolean>(true);

  // Editable captions prior to publishing
  const [facebookCaption, setFacebookCaption] = useState<string>(
    posts.facebook?.caption || posts.feed?.headline || ''
  );
  const [instagramCaption, setInstagramCaption] = useState<string>(
    posts.instagram?.caption || posts.feed?.headline || ''
  );

  // UI state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [lastPublication, setLastPublication] = useState<PublicationRecord | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [retryingPlatform, setRetryingPlatform] = useState<'facebook' | 'instagram' | null>(null);

  // Sync state if props change
  useEffect(() => {
    setFacebookCaption(posts.facebook?.caption || posts.feed?.headline || '');
    setInstagramCaption(posts.instagram?.caption || posts.feed?.headline || '');
  }, [posts]);

  // Set default targets based on what is connected
  useEffect(() => {
    if (!metaLoading) {
      setTargetFacebook(metaStatus.facebook.connected);
      setTargetInstagram(metaStatus.instagram.connected);
    }
  }, [metaStatus.facebook.connected, metaStatus.instagram.connected, metaLoading]);

  // Handle Approval Workflow
  const handleApprove = () => {
    const approver = user?.email || 'Editor Institucional';
    const now = new Date().toISOString();
    setLifecycleStatus('APROBADO');
    setApprovedBy(approver);
    setApprovedAt(now);
    setPublishError(null);
  };

  const handleRevokeApproval = () => {
    setLifecycleStatus('EN REVISIÓN');
    setApprovedBy(null);
    setApprovedAt(null);
  };

  // Handle Publish Now
  const handlePublishNow = async () => {
    if (lifecycleStatus !== 'APROBADO') {
      setPublishError('El contenido debe estar APROBADO antes de publicarse.');
      return;
    }

    if (!targetFacebook && !targetInstagram) {
      setPublishError('Debes seleccionar al menos una red social para publicar.');
      return;
    }

    setPublishError(null);
    setIsPublishing(true);
    setLifecycleStatus('PUBLICANDO');

    try {
      // Effective image to send
      const effectiveImage =
        renderedCardDataUrl ||
        article.mainImage ||
        'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=80';

      const response = await publish({
        articleTitle: article.title || posts.feed?.headline || 'Comunicado Oficial',
        category: posts.feed?.category || 'Institucional',
        headline: posts.feed?.headline || article.title || '',
        subtitle: posts.feed?.subtitle || article.subtitle || '',
        facebookCaption,
        instagramCaption,
        imageUrl: effectiveImage,
        format: activeFormat,
        targets: {
          facebook: targetFacebook,
          instagram: targetInstagram,
        },
        approvedBy: approvedBy || user?.email || 'Editor',
        approvedAt: approvedAt || new Date().toISOString(),
        lifecycleStatus: 'APROBADO',
      });

      setLastPublication(response.publication);

      if (response.publication?.status === 'PUBLICADO') {
        setLifecycleStatus('PUBLICADO');
      } else if (response.publication?.status === 'ERROR') {
        setLifecycleStatus('ERROR');
      } else {
        setLifecycleStatus('PUBLICADO');
      }
    } catch (err: any) {
      console.error('Error during real Meta publish:', err);
      setLifecycleStatus('ERROR');
      setPublishError(err.message || 'Error inesperado al conectar con las APIs de Meta.');
    } finally {
      setIsPublishing(false);
    }
  };

  // Handle Retry Platform
  const handleRetryPlatform = async (platform: 'facebook' | 'instagram') => {
    if (!lastPublication?.id) return;
    setRetryingPlatform(platform);
    try {
      const updatedResult = await retry(lastPublication.id, platform);
      setLastPublication((prev) => {
        if (!prev) return prev;
        const newResults = {
          ...prev.results,
          [platform]: updatedResult,
        };
        const allPublished =
          (!prev.targets.facebook || newResults.facebook?.status === 'published') &&
          (!prev.targets.instagram || newResults.instagram?.status === 'published');

        return {
          ...prev,
          status: allPublished ? 'PUBLICADO' : prev.status,
          results: newResults,
        };
      });

      if (updatedResult.status === 'published') {
        setLifecycleStatus('PUBLICADO');
      }
    } catch (err: any) {
      setPublishError(err.message || `Error al reintentar publicación en ${platform}`);
    } finally {
      setRetryingPlatform(null);
    }
  };

  const orgName = organization?.name || branding.name || 'Institución';

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-6">
      <div className="rounded-xl border border-brand-navy/15 bg-white p-5 sm:p-6 shadow-card space-y-6">
        {/* TOP STATUS BAR & APPROVAL FLOW */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-navy/15 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-soft text-brand-primary-deep border border-brand-primary/30">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-brand-ink tracking-wide uppercase">
                  Flujo de Aprobación y Publicación
                </h3>
                {/* Lifecycle Status Badge */}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                    lifecycleStatus === 'APROBADO'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : lifecycleStatus === 'PUBLICADO'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : lifecycleStatus === 'PUBLICANDO'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : lifecycleStatus === 'ERROR'
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-brand-navy/5 text-brand-navy/60 border border-brand-navy/15'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      lifecycleStatus === 'APROBADO'
                        ? 'bg-emerald-500'
                        : lifecycleStatus === 'PUBLICADO'
                        ? 'bg-blue-500'
                        : lifecycleStatus === 'PUBLICANDO'
                        ? 'bg-amber-500 animate-ping'
                        : lifecycleStatus === 'ERROR'
                        ? 'bg-rose-500'
                        : 'bg-brand-navy/50'
                    }`}
                  />
                  {lifecycleStatus === 'APROBADO'
                    ? '✓ Contenido Aprobado'
                    : lifecycleStatus === 'PUBLICADO'
                    ? '✓ Publicado Oficial'
                    : lifecycleStatus === 'PUBLICANDO'
                    ? 'Enviando a Meta...'
                    : lifecycleStatus === 'ERROR'
                    ? '✕ Error en Publicación'
                    : lifecycleStatus === 'EN REVISIÓN'
                    ? 'En Revisión'
                    : 'Borrador'}
                </span>
              </div>
              <p className="text-xs text-brand-navy/60 mt-0.5 font-normal">
                Revisa y aprueba el contenido antes de enviarlo a las cuentas oficiales de {orgName}.
              </p>
            </div>
          </div>

          {/* Right Action: Approve / Revoke */}
          <div className="flex items-center gap-2">
            {lifecycleStatus !== 'APROBADO' && lifecycleStatus !== 'PUBLICADO' ? (
              <button
                type="button"
                onClick={handleApprove}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition-all shadow-md cursor-pointer"
              >
                <Check className="h-4 w-4" />
                <span>Aprobar Contenido</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <p className="text-[11px] font-semibold text-emerald-600">
                    Aprobado por {approvedBy}
                  </p>
                  <p className="text-[10px] text-brand-navy/60 font-mono">
                    {approvedAt ? new Date(approvedAt).toLocaleTimeString('es-AR') : ''}
                  </p>
                </div>
                {lifecycleStatus !== 'PUBLICADO' && (
                  <button
                    type="button"
                    onClick={handleRevokeApproval}
                    className="flex items-center gap-1 rounded-lg border border-brand-navy/15 bg-brand-navy/5 px-3 py-2 text-xs font-medium text-brand-navy/80 hover:text-brand-ink cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Modificar</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ERROR NOTIFICATION IF ANY */}
        {publishError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-rose-800">Aviso de Publicación</p>
              <p className="text-rose-800/90 leading-relaxed">{publishError}</p>
            </div>
          </div>
        )}

        {/* STEP 5 & 6: MAIN BUTTON "PUBLICAR" & EXPANDABLE PUBLISH DASHBOARD */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand-primary-deep" />
              <h4 className="text-sm font-bold text-brand-ink">
                Canales Oficiales Vinculados de {orgName}
              </h4>
            </div>

            {onOpenSocialSettings && (
              <button
                type="button"
                onClick={onOpenSocialSettings}
                className="text-xs text-brand-primary-deep hover:text-brand-primary underline cursor-pointer"
              >
                Configurar Cuentas
              </button>
            )}
          </div>

          {/* Social Platforms Cards with Checkbox Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* FACEBOOK CARD */}
            <div
              className={`rounded-lg border p-4 transition-all ${
                targetFacebook && metaStatus.facebook.connected
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-brand-navy/15 bg-brand-navy/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={targetFacebook}
                      onChange={(e) => setTargetFacebook(e.target.checked)}
                      disabled={!metaStatus.facebook.connected || isPublishing}
                      className="h-4 w-4 rounded border-brand-navy/15 bg-white text-brand-primary focus:ring-0 focus:ring-offset-0 cursor-pointer disabled:opacity-40"
                    />
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary text-brand-ink shadow-xs">
                      <Facebook className="h-4 w-4" />
                    </div>
                  </label>
                  <div>
                    <h5 className="text-xs font-bold text-brand-ink">Facebook</h5>
                    {metaStatus.facebook.connected ? (
                      <p className="text-[11px] text-brand-navy/80 font-medium truncate max-w-[200px]">
                        {metaStatus.facebook.pageName || 'Página de la Institución'}
                      </p>
                    ) : (
                      <p className="text-[11px] text-brand-navy/50">No conectado</p>
                    )}
                  </div>
                </div>

                {metaStatus.facebook.connected ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <Check className="h-3 w-3" />
                    Vinculado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={connect}
                    className="text-[11px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded border border-blue-200 cursor-pointer"
                  >
                    Conectar Facebook
                  </button>
                )}
              </div>

              {/* Editable Caption for Facebook */}
              <div className="mt-3 pt-3 border-t border-brand-navy/10 space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-brand-navy/60 tracking-wider">
                  Texto para Facebook:
                </label>
                <textarea
                  rows={2}
                  value={facebookCaption}
                  onChange={(e) => setFacebookCaption(e.target.value)}
                  disabled={isPublishing}
                  placeholder="Escribe el texto para la publicación en Facebook..."
                  className="w-full rounded-md border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-navy focus:border-brand-primary focus:outline-none"
                />
              </div>

              {/* Individual Platform Publish Result */}
              {lastPublication?.results?.facebook && (
                <div className="mt-3 pt-2 border-t border-brand-navy/10">
                  {lastPublication.results.facebook.status === 'published' ? (
                    <div className="flex items-center justify-between text-xs text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-200">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>Publicado correctamente en Facebook</span>
                      </div>
                      {lastPublication.results.facebook.permalinkUrl && (
                        <a
                          href={lastPublication.results.facebook.permalinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] underline font-medium hover:text-brand-ink"
                        >
                          Ver <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5 bg-rose-50 p-2 rounded border border-rose-200 text-xs text-rose-700">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Error en Facebook
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRetryPlatform('facebook')}
                          disabled={retryingPlatform === 'facebook'}
                          className="flex items-center gap-1 bg-rose-900/80 hover:bg-rose-800 text-white px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${retryingPlatform === 'facebook' ? 'animate-spin' : ''}`}
                          />
                          <span>Reintentar</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-rose-800/90 leading-tight">
                        {lastPublication.results.facebook.errorMessage || 'Error en Meta Graph API'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* INSTAGRAM CARD */}
            <div
              className={`rounded-lg border p-4 transition-all ${
                targetInstagram && metaStatus.instagram.connected
                  ? 'border-rose-300 bg-rose-50'
                  : 'border-brand-navy/15 bg-brand-navy/5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={targetInstagram}
                      onChange={(e) => setTargetInstagram(e.target.checked)}
                      disabled={!metaStatus.instagram.connected || isPublishing}
                      className="h-4 w-4 rounded border-brand-navy/15 bg-white text-brand-primary focus:ring-0 focus:ring-offset-0 cursor-pointer disabled:opacity-40"
                    />
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shadow-xs">
                      <Instagram className="h-4 w-4" />
                    </div>
                  </label>
                  <div>
                    <h5 className="text-xs font-bold text-brand-ink">Instagram</h5>
                    {metaStatus.instagram.connected ? (
                      <p className="text-[11px] text-brand-navy/80 font-medium">
                        @{metaStatus.instagram.username || 'usuario'}
                      </p>
                    ) : (
                      <p className="text-[11px] text-brand-navy/50">No conectado</p>
                    )}
                  </div>
                </div>

                {metaStatus.instagram.connected ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <Check className="h-3 w-3" />
                    Vinculado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={connect}
                    className="text-[11px] font-bold text-rose-700 hover:text-rose-800 bg-rose-50 px-2.5 py-1 rounded border border-rose-200 cursor-pointer"
                  >
                    Conectar Instagram
                  </button>
                )}
              </div>

              {/* Editable Caption for Instagram */}
              <div className="mt-3 pt-3 border-t border-brand-navy/10 space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-brand-navy/60 tracking-wider">
                  Texto para Instagram:
                </label>
                <textarea
                  rows={2}
                  value={instagramCaption}
                  onChange={(e) => setInstagramCaption(e.target.value)}
                  disabled={isPublishing}
                  placeholder="Escribe el epígrafe para Instagram con hashtags..."
                  className="w-full rounded-md border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-navy focus:border-brand-primary focus:outline-none"
                />
              </div>

              {/* Individual Platform Publish Result */}
              {lastPublication?.results?.instagram && (
                <div className="mt-3 pt-2 border-t border-brand-navy/10">
                  {lastPublication.results.instagram.status === 'published' ? (
                    <div className="flex items-center justify-between text-xs text-emerald-600 bg-emerald-50 p-2 rounded border border-emerald-200">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>Publicado correctamente en Instagram</span>
                      </div>
                      {lastPublication.results.instagram.permalinkUrl && (
                        <a
                          href={lastPublication.results.instagram.permalinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] underline font-medium hover:text-brand-ink"
                        >
                          Ver <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5 bg-rose-50 p-2 rounded border border-rose-200 text-xs text-rose-700">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Error en Instagram
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRetryPlatform('instagram')}
                          disabled={retryingPlatform === 'instagram'}
                          className="flex items-center gap-1 bg-rose-900/80 hover:bg-rose-800 text-white px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${retryingPlatform === 'instagram' ? 'animate-spin' : ''}`}
                          />
                          <span>Reintentar</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-rose-800/90 leading-tight">
                        {lastPublication.results.instagram.errorMessage || 'Error en Meta Graph API'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* MAIN "PUBLICAR AHORA" BUTTON */}
          <div className="pt-4 border-t border-brand-navy/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-brand-navy/60">
              {lifecycleStatus !== 'APROBADO' ? (
                <span className="text-amber-700 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  El botón "PUBLICAR AHORA" estará habilitado una vez que apruebes el contenido.
                </span>
              ) : !targetFacebook && !targetInstagram ? (
                <span className="text-brand-navy/60">
                  Selecciona al menos una red social para publicar.
                </span>
              ) : (
                <span className="text-emerald-700 flex items-center gap-1.5">
                  <Check className="h-4 w-4 shrink-0" />
                  Contenido listo para ser enviado a las cuentas oficiales seleccionadas.
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handlePublishNow}
              disabled={
                lifecycleStatus !== 'APROBADO' ||
                (!targetFacebook && !targetInstagram) ||
                isPublishing
              }
              className="flex items-center justify-center gap-2.5 rounded-lg bg-brand-primary hover:bg-brand-primary-hover px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-brand-ink transition-all shadow-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {isPublishing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Publicando en Meta...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>PUBLICAR AHORA</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
