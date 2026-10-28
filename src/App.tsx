import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { UrlForm } from './components/UrlForm';
import { ExtractedArticleCard } from './components/ExtractedArticleCard';
import { VisualCardPreview } from './components/VisualCardPreview';
import { CaptionsTabs } from './components/CaptionsTabs';
import { HashtagsAndMetadata } from './components/HashtagsAndMetadata';
import { HistoryDrawer } from './components/HistoryDrawer';
import { BrandingModal } from './components/BrandingModal';
import { IntegrationsModal } from './components/IntegrationsModal';
import { IdentitySection } from './components/IdentitySection';
import { AuthModal } from './components/AuthModal';
import { BillingModal } from './components/BillingModal';
import { AdminGenerationsModal } from './components/AdminGenerationsModal';
import { EmailVerificationBanner } from './components/EmailVerificationBanner';
import { AdminWorkspaceBanner } from './components/AdminWorkspaceBanner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OrganizationProvider, useOrganization } from './context/OrganizationContext';
import {
  NewsArticleData,
  SocialPostsOutput,
  OutletBranding,
  GeneratedNewsResult,
  SampleNewsItem,
  OrganizationIdentity,
  DEFAULT_TRIAL_PUBLICATION_LIMIT,
} from './types';
import { DEFAULT_IDENTITY } from './data/sampleIdentities';
import { useOrganizationWorkspace } from './hooks/useOrganizationWorkspace';
import { Newspaper, CheckCircle2, Building2 } from 'lucide-react';

// Clients pay a flat fee and never see balances; Titular keeps the organization topped up.
const GENERATION_PAUSED_MESSAGE =
  'La generación de contenidos de tu medio está pausada en este momento. Contactá al equipo de Titular para reactivarla.';

function MainAppContent() {
  const {
    user,
    authFetch,
    isBillingOpen,
    setIsBillingOpen,
    isAuthModalOpen,
    setIsAuthModalOpen,
    isAdmin,
  } = useAuth();

  const { organization } = useOrganization();

  // Identity, branding and history belong to the active newsroom (Firestore), shared by its members.
  const workspace = useOrganizationWorkspace();
  const { identities, activeIdentityId, branding, history } = workspace;

  const [activeView, setActiveView] = useState<'generator' | 'identity'>('generator');

  const [currentArticle, setCurrentArticle] = useState<NewsArticleData | null>(null);
  const [currentPosts, setCurrentPosts] = useState<SocialPostsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  // Modals / Drawers
  const [isBrandingOpen, setIsBrandingOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isIntegrationsOpen, setIsIntegrationsOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  const activeIdentity: OrganizationIdentity =
    identities.find((i) => i.id === activeIdentityId) ||
    identities[0] ||
    { ...DEFAULT_IDENTITY, name: organization?.name || DEFAULT_IDENTITY.name };

  const persist = (action: Promise<void>, message: string) => {
    action.catch((err) => {
      console.error(message, err);
      setError(`${message} Revisá tu conexión e intentá nuevamente.`);
    });
  };

  // Detect query params for billing redirects (success/pending/failure)
  useEffect(() => {
    // Payment redirects only concern platform admins; clients never see balances or plans.
    if (!isAdmin) return;
    const params = new URLSearchParams(window.location.search);
    const billingStatus = params.get('billing');
    if (billingStatus === 'success') {
      setBillingMessage('¡Pago acreditado con éxito! Tu saldo de publicaciones ha sido actualizado.');
      setIsBillingOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (billingStatus === 'pending') {
      setBillingMessage('Tu pago se encuentra en proceso de aprobación por Mercado Pago.');
      setIsBillingOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (billingStatus === 'failure') {
      setError('No se pudo completar el pago en Mercado Pago. Por favor intentá nuevamente.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setIsBillingOpen, isAdmin]);

  const handleProcessUrl = async (url: string) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const pubLimit = organization?.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
    const pubUsed = organization?.publicationUsed ?? 0;
    if (pubUsed >= pubLimit) {
      if (isAdmin) setIsBillingOpen(true);
      else setError(GENERATION_PAUSED_MESSAGE);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Step 1: Extract news article (Free)
      setLoadingStep(`1/2. Obteniendo noticia y extrayendo contenido con perfil de ${activeIdentity.name}...`);
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json();
        throw new Error(errData.error || 'Error al extraer la noticia desde la URL.');
      }

      const extractedArticle: NewsArticleData = await extractRes.json();
      setCurrentArticle(extractedArticle);

      // Step 2: Send to Gemini AI Editorial Model
      setLoadingStep(`2/2. Editor IA aplicando ADN Editorial y Visual (${activeIdentity.editorial.tone}, ${activeIdentity.editorial.emojiUsage})...`);
      const idempotencyKey = crypto.randomUUID();
      const genRes = await authFetch('/api/generate-posts', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          article: extractedArticle,
          identity: activeIdentity,
        }),
      });

      if (genRes.status === 402 && !isAdmin) {
        throw new Error(GENERATION_PAUSED_MESSAGE);
      }

      if (!genRes.ok) {
        const errData = await genRes.json();
        throw new Error(errData.error || 'Error al generar contenidos con el editor IA.');
      }

      const postsOutput: SocialPostsOutput = await genRes.json();
      setCurrentPosts(postsOutput);

      const newResult: GeneratedNewsResult = {
        id: `news-${Date.now()}`,
        createdAt: new Date().toISOString(),
        article: extractedArticle,
        posts: postsOutput,
        branding: {
          name: activeIdentity.name,
          accentColor: activeIdentity.visual.primaryColor,
          themeStyle: 'dark',
        },
      };

      persist(workspace.addHistoryItem(newResult, true), 'No se pudo guardar la noticia en el historial del medio.');
    } catch (err: any) {
      console.error('Processing error:', err);
      setError(err.message || 'Ocurrió un error inesperado durante la generación.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleProcessText = async (text: string, title?: string, importType: 'text' | 'document' | 'image' = 'text') => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const pubLimit = organization?.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
    const pubUsed = organization?.publicationUsed ?? 0;
    if (pubUsed >= pubLimit) {
      if (isAdmin) setIsBillingOpen(true);
      else setError(GENERATION_PAUSED_MESSAGE);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      setLoadingStep(`1/2. Procesando ${importType === 'document' ? 'documento' : importType === 'image' ? 'imagen/flyer' : 'comunicado'} con perfil de ${activeIdentity.name}...`);
      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: text, title, importType }),
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json();
        throw new Error(errData.error || 'Error al procesar el texto ingresado.');
      }

      const extractedArticle: NewsArticleData = await extractRes.json();
      setCurrentArticle(extractedArticle);

      setLoadingStep(`2/2. Generando publicaciones adaptadas a la identidad de ${activeIdentity.name}...`);
      const idempotencyKey = crypto.randomUUID();
      const genRes = await authFetch('/api/generate-posts', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          article: extractedArticle,
          identity: activeIdentity,
        }),
      });

      if (genRes.status === 402 && !isAdmin) {
        throw new Error(GENERATION_PAUSED_MESSAGE);
      }

      if (!genRes.ok) {
        const errData = await genRes.json();
        throw new Error(errData.error || 'Error al generar contenidos con el editor IA.');
      }

      const postsOutput: SocialPostsOutput = await genRes.json();
      setCurrentPosts(postsOutput);

      const newResult: GeneratedNewsResult = {
        id: `news-${Date.now()}`,
        createdAt: new Date().toISOString(),
        article: extractedArticle,
        posts: postsOutput,
        branding: {
          name: activeIdentity.name,
          accentColor: activeIdentity.visual.primaryColor,
          themeStyle: 'dark',
        },
      };

      persist(workspace.addHistoryItem(newResult), 'No se pudo guardar la noticia en el historial del medio.');
    } catch (err: any) {
      console.error('Processing text error:', err);
      setError(err.message || 'Ocurrió un error inesperado durante el procesamiento.');
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleSelectSample = (sample: SampleNewsItem) => {
    handleProcessUrl(sample.url);
  };

  const handleSelectHistoryItem = (item: GeneratedNewsResult) => {
    setCurrentArticle(item.article);
    setCurrentPosts(item.posts);
    setActiveView('generator');
  };

  const handleClearHistory = () => {
    persist(workspace.clearHistory(), 'No se pudo vaciar el historial.');
  };

  const handleDeleteHistoryItem = (id: string) => {
    persist(workspace.deleteHistoryItem(id), 'No se pudo eliminar la noticia del historial.');
  };

  const handleSelectIdentity = (id: string) => {
    persist(workspace.setActiveIdentityId(id), 'No se pudo cambiar la identidad activa.');
  };

  const handleCreateIdentity = (newIdentity: OrganizationIdentity) => {
    persist(
      workspace.saveIdentity(newIdentity).then(() => workspace.setActiveIdentityId(newIdentity.id)),
      'No se pudo guardar la nueva identidad.'
    );
  };

  const handleUpdateIdentity = (updated: OrganizationIdentity) => {
    persist(workspace.saveIdentity(updated), 'No se pudo guardar la identidad.');
  };

  const handleDeleteIdentity = (id: string) => {
    if (identities.length <= 1) return;
    const remaining = identities.filter((i) => i.id !== id);
    persist(
      (activeIdentityId === id ? workspace.setActiveIdentityId(remaining[0].id) : Promise.resolve()).then(() =>
        workspace.deleteIdentity(id)
      ),
      'No se pudo eliminar la identidad.'
    );
  };

  const handleSaveBranding = (next: OutletBranding) => {
    persist(workspace.saveBranding(next), 'No se pudo guardar la marca del medio.');
  };

  return (
    <div className="app-shell min-h-screen text-brand-ink font-sans selection:bg-brand-primary selection:text-brand-ink flex flex-col justify-between">
      <div>
        {/* Main Sticky Header */}
        <Header
          branding={branding}
          activeIdentity={activeIdentity}
          activeView={activeView}
          onChangeView={setActiveView}
          onOpenBranding={() => setIsBrandingOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onOpenIntegrations={() => setIsIntegrationsOpen(true)}
          onOpenAdmin={() => setIsAdminModalOpen(true)}
          savedCount={history.length}
        />

        <AdminWorkspaceBanner />
        <EmailVerificationBanner />

        {/* View 1: Generator Dashboard */}
        {activeView === 'generator' && (
          <main>
            <UrlForm
              onGenerate={handleProcessUrl}
              onGenerateFromText={handleProcessText}
              onSelectSample={handleSelectSample}
              isLoading={isLoading}
              loadingStep={loadingStep}
              error={error}
              activeIdentity={activeIdentity}
              onOpenIdentityModal={() => setActiveView('identity')}
            />

            {/* Results Display Area */}
            {currentArticle && currentPosts && (
              <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6 animate-fade-in">
                <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-emerald-50 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-brand-ink">Noticia procesada</h2>
                      <p className="text-xs text-brand-navy/60 font-normal">
                        Piezas generadas para <span className="text-brand-navy font-medium">{activeIdentity.name}</span>
                      </p>
                    </div>
                  </div>

                  <span className="rounded bg-brand-navy/5 border border-brand-navy/10 px-2.5 py-1 text-xs text-brand-navy/80 font-medium">
                    {activeIdentity.orgType || 'Medio'}
                  </span>
                </div>

                {/* Extracted Clean Article Card */}
                <ExtractedArticleCard article={currentArticle} />

                {/* Visual Social Media Card Previews (editor + manual social handoff) */}
                <VisualCardPreview
                  posts={currentPosts}
                  article={currentArticle}
                  branding={branding}
                  activeIdentity={activeIdentity}
                />

                {/* Social Captions Tabs */}
                <CaptionsTabs posts={currentPosts} />

                {/* Hashtags, Keywords & Article Metadata */}
                <HashtagsAndMetadata posts={currentPosts} article={currentArticle} />
              </div>
            )}
          </main>
        )}

        {/* View 2: Identity Training & Management Dashboard */}
        {activeView === 'identity' && (
          <main className="animate-fade-in">
            <IdentitySection
              identities={identities}
              activeIdentityId={activeIdentityId}
              onSelectIdentity={handleSelectIdentity}
              onCreateIdentity={handleCreateIdentity}
              onUpdateIdentity={handleUpdateIdentity}
              onDeleteIdentity={handleDeleteIdentity}
            />
          </main>
        )}

        {/* View 3: Official Social Media Accounts (Meta Graph API) — disabled for now:
            publishing is manual (download image + copy caption/hashtags). */}
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-brand-navy/10 bg-brand-base py-4 text-center text-xs mt-12">
        <p className="font-brand text-sm text-brand-navy tracking-tight">
          © {new Date().getFullYear()} Titular Studio
        </p>
        <p className="font-editorial text-[11px] text-brand-navy/60 font-normal">
          Software editorial para redacciones y medios de comunicación
        </p>
      </footer>

      {/* Modals and Drawers */}
      <BrandingModal
        isOpen={isBrandingOpen}
        onClose={() => setIsBrandingOpen(false)}
        branding={branding}
        onSaveBranding={handleSaveBranding}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectResult={handleSelectHistoryItem}
        onClearHistory={handleClearHistory}
        onDeleteResult={handleDeleteHistoryItem}
      />

      <IntegrationsModal
        isOpen={isIntegrationsOpen}
        onClose={() => setIsIntegrationsOpen(false)}
        onSelectSampleFeedUrl={(url) => {
          setActiveView('generator');
          handleProcessUrl(url);
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <BillingModal
        isOpen={isBillingOpen}
        onClose={() => setIsBillingOpen(false)}
        billingMessage={billingMessage}
      />

      <AdminGenerationsModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onOpenOrganization={() => setActiveView('identity')}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <MainAppContent />
      </OrganizationProvider>
    </AuthProvider>
  );
}
