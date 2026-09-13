import React, { useState } from 'react';
import { X, Rss, Globe, CheckCircle2, Zap, ArrowRight, RefreshCcw, Facebook, Instagram } from 'lucide-react';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSampleFeedUrl: (url: string) => void;
  onOpenSocial?: () => void;
}

export const IntegrationsModal: React.FC<IntegrationsModalProps> = ({
  isOpen,
  onClose,
  onSelectSampleFeedUrl,
  onOpenSocial,
}) => {
  const [rssUrl, setRssUrl] = useState('https://tumedio.com/feed/');
  const [isSimulating, setIsSimulating] = useState(false);
  const [feedDetected, setFeedDetected] = useState(false);

  if (!isOpen) return null;

  const handleSimulateFeed = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setFeedDetected(true);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-ink/40 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-xl rounded-xl border border-brand-navy/15 bg-white p-6 text-brand-ink shadow-raised space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-brand-navy/15">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 border border-amber-200 text-amber-600">
              <Rss className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-brand-ink">Auto-Flow RSS & CMS (Próximas Integraciones)</h3>
                <span className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  PRO
                </span>
              </div>
              <p className="text-xs text-brand-navy/60 font-normal">
                Conexión directa con gestores de contenidos periodísticos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-brand-navy/60 hover:bg-brand-navy/5 hover:text-brand-ink transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <p className="text-brand-navy/80 leading-relaxed font-normal">
            NewsFlow AI está diseñado con arquitectura modular para conectarse directamente al CMS de tu diario o medio digital (WordPress, Ghost, Drupal, RSS Feeds o Webhooks).
          </p>

          {/* Integration Modules Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-brand-navy/15 bg-brand-navy/5 p-3 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-brand-primary-deep flex items-center gap-1 mb-1">
                  <Globe className="h-3.5 w-3.5" /> WordPress API
                </span>
                <p className="text-[11px] text-brand-navy/60 font-normal">Escucha nuevos artículos en <code className="text-brand-navy font-mono">/wp-json/wp/v2/posts</code>.</p>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Compatible
              </span>
            </div>

            <div className="rounded-lg border border-brand-navy/15 bg-brand-navy/5 p-3 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-amber-600 flex items-center gap-1 mb-1">
                  <Rss className="h-3.5 w-3.5" /> RSS / Atom
                </span>
                <p className="text-[11px] text-brand-navy/60 font-normal">Monitoreo continuo de feeds XML/RSS de periódicos digitales.</p>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Compatible
              </span>
            </div>

            <div className="rounded-lg border border-brand-navy/15 bg-brand-navy/5 p-3 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-brand-primary-deep flex items-center gap-1 mb-1">
                  <Zap className="h-3.5 w-3.5" /> Webhooks / APIs
                </span>
                <p className="text-[11px] text-brand-navy/60 font-normal">Disparo instantáneo cuando el editor presiona "Publicar".</p>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> Compatible
              </span>
            </div>
          </div>

          {/* Live Simulator Test Box */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <span className="font-bold text-amber-800 block">Simulador de Monitoreo RSS en Tiempo Real:</span>
            <div className="flex gap-2">
              <input
                type="url"
                value={rssUrl}
                onChange={(e) => setRssUrl(e.target.value)}
                className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-ink font-mono focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={handleSimulateFeed}
                disabled={isSimulating}
                className="flex items-center gap-1 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-brand-ink hover:bg-amber-500 shrink-0 shadow-sm cursor-pointer"
              >
                {isSimulating ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                <span>Probar Feed</span>
              </button>
            </div>

            {feedDetected && (
              <div className="rounded-lg bg-brand-navy/5 p-3 border border-emerald-200 text-brand-ink space-y-2 shadow-md">
                <p className="font-bold flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> ¡Última noticia capturada automáticamente!
                </p>
                <p className="text-brand-navy/80 text-[11px] font-normal">
                  Centro Tecnológico lanza un nuevo programa de capacitación en IA para PyMEs.
                </p>
                <button
                  onClick={() => {
                    onSelectSampleFeedUrl('https://misionesonline.net/2026/07/22/nuevo-programa-inteligencia-artificial-para-pymes/');
                    onClose();
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-brand-primary-deep hover:underline pt-1 cursor-pointer"
                >
                  <span>Cargar noticia capturada en la app</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* Direct Meta Social Publishing Banner */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1 text-brand-primary-deep">
                  <Facebook className="h-4 w-4" />
                  <Instagram className="h-4 w-4 text-rose-600" />
                </div>
                <h4 className="text-xs font-bold text-brand-ink">Publicación Real en Meta (Facebook & Instagram)</h4>
              </div>
              <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                DISPONIBLE
              </span>
            </div>
            <p className="text-[11px] text-brand-navy/80">
              Conecta las cuentas oficiales de tu institución mediante OAuth de Meta para publicar comunicados y noticias directamente desde Hermes.
            </p>
            {onOpenSocial && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSocial();
                }}
                className="mt-1 flex items-center gap-1 text-xs font-bold text-brand-primary-deep hover:text-brand-primary underline cursor-pointer"
              >
                <span>Administrar cuentas sociales de la institución</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-brand-navy/15 flex justify-end">
            <button
              onClick={onClose}
              className="rounded-lg bg-brand-primary px-5 py-2 text-xs font-bold text-brand-ink hover:bg-brand-primary-hover transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

