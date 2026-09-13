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
import { SocialAccountsSection } from './components/SocialAccountsSection';
import { AuthModal } from './components/AuthModal';
import { BillingModal } from './components/BillingModal';
import { AdminGenerationsModal } from './components/AdminGenerationsModal';
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
import { PRESET_ORGANIZATIONS } from './data/sampleIdentities';
import { Newspaper, CheckCircle2, Building2 } from 'lucide-react';

const STORAGE_KEY = 'newsflow_ai_history_v1';
const BRANDING_KEY = 'newsflow_ai_branding_v1';
const IDENTITIES_KEY = 'newsflow_ai_identities_v1';
const ACTIVE_IDENTITY_KEY = 'newsflow_ai_active_identity_v1';

function MainAppContent() {
  const {
    user,
    authFetch,
    isBillingOpen,
    setIsBillingOpen,
    isAuthModalOpen,
    setIsAuthModalOpen,
  } = useAuth();

  const { organization } = useOrganization();

  const [branding, setBranding] = useState<OutletBranding>(() => {
    try {
      const saved = localStorage.getItem(BRANDING_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return {
      name: 'Tu Medio Digital',
      accentColor: '#2563eb',
      themeStyle: 'dark',
    };
  });

  const [identities, setIdentities] = useState<OrganizationIdentity[]>(() => {
    try {
      const saved = localStorage.getItem(IDENTITIES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return PRESET_ORGANIZATIONS;
  });

  const [activeIdentityId, setActiveIdentityId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_IDENTITY_KEY);
      if (saved && identities.some((i) => i.id === saved)) return saved;
    } catch {
      // Ignore
    }
    return 'org-tu-medio';
  });

  const [activeView, setActiveView] = useState<'generator' | 'identity' | 'social'>('generator');

  const [history, setHistory] = useState<GeneratedNewsResult[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore
    }
    return [];
  });

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

  const activeIdentity = identities.find((i) => i.id === activeIdentityId) || identities[0];

  // Detect query params for billing redirects (success/pending/failure)
  useEffect(() => {
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
  }, [setIsBillingOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(BRANDING_KEY, JSON.stringify(branding));
    } catch {
      // Ignore
    }
  }, [branding]);

  useEffect(() => {
    try {
      localStorage.setItem(IDENTITIES_KEY, JSON.stringify(identities));
    } catch {
      // Ignore
    }
  }, [identities]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_IDENTITY_KEY, activeIdentityId);
    } catch {
      // Ignore
    }
  }, [activeIdentityId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore
    }
  }, [history]);

  const handleProcessUrl = async (url: string) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const pubLimit = organization?.publicationLimit ?? DEFAULT_TRIAL_PUBLICATION_LIMIT;
    const pubUsed = organization?.publicationUsed ?? 0;
    if (pubUsed >= pubLimit) {
      setIsBillingOpen(true);
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
      setLoadingStep(`2/2. Editor IA aplicando ADN Editorial y Visual (${activeIdentity.editorial.editorialTone}, ${activeIdentity.editorial.emojiUsage})...`);
      const idempotencyKey = crypto.randomUUID();
      const genRes = await authFetch('/api/generate-posts', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          article: extractedArticle,
          identity: activeIdentity,
        }),
      });

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

      setHistory((prev) => [newResult, ...prev.filter((h) => h.article.url !== extractedArticle.url)]);
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
      setIsBillingOpen(true);
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

      setHistory((prev) => [newResult, ...prev]);
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
    setHistory([]);
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSelectIdentity = (id: string) => {
    setActiveIdentityId(id);
  };

  const handleCreateIdentity = (newIdentity: OrganizationIdentity) => {
    setIdentities((prev) => [...prev, newIdentity]);
    setActiveIdentityId(newIdentity.id);
  };

  const handleUpdateIdentity = (updated: OrganizationIdentity) => {
    setIdentities((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const handleDeleteIdentity = (id: string) => {
    if (identities.length <= 1) return;
    setIdentities((prev) => prev.filter((i) => i.id !== id));
    if (activeIdentityId === id) {
      const remaining = identities.filter((i) => i.id !== id);
      setActiveIdentityId(remaining[0].id);
    }
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

                {/* Visual Social Media Card Previews */}
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

        {/* View 3: Official Social Media Accounts (Meta Graph API) */}
        {activeView === 'social' && (
          <main className="animate-fade-in">
            <SocialAccountsSection />
          </main>
        )}
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
        onSaveBranding={setBranding}
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
        onOpenSocial={() => setActiveView('social')}
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
