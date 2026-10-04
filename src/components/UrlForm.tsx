import React, { useState } from 'react';
import {
  Globe,
  Loader2,
  FileText,
  FileCode,
  Upload,
  Link2,
} from 'lucide-react';
import { SAMPLE_NEWS } from '../data/sampleNews';
import { SampleNewsItem, OrganizationIdentity } from '../types';

interface UrlFormProps {
  onGenerate: (url: string) => void;
  onGenerateFromText?: (text: string, title?: string, importType?: 'text' | 'document' | 'image') => void;
  onSelectSample: (sample: SampleNewsItem) => void;
  isLoading: boolean;
  loadingStep: string;
  error: string | null;
  activeIdentity?: OrganizationIdentity;
  onOpenIdentityModal?: () => void;
}

export const UrlForm: React.FC<UrlFormProps> = ({
  onGenerate,
  onGenerateFromText,
  onSelectSample,
  isLoading,
  loadingStep,
  error,
}) => {
  const [importMode, setImportMode] = useState<'url' | 'pdf' | 'word'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [docContent, setDocContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [showSampleDropdown, setShowSampleDropdown] = useState(false);

  const handleSubmitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || isLoading) return;
    onGenerate(urlInput.trim());
  };

  const handleSubmitDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docContent.trim() || isLoading) return;
    if (onGenerateFromText) {
      onGenerateFromText(docContent.trim(), fileName, 'document');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setFileName(cleanName);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setDocContent(text || `[Documento adjunto: ${file.name}]\n\nContenido del informe o comunicado institucional.`);
      };
      if (file.type.includes('text') || file.name.endsWith('.txt')) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
        setDocContent(`[Documento Institucional Adjunto: ${file.name}]\n\nSe procesará el comunicado para estructurar la noticia y generar las piezas de comunicación social.`);
      }
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && importMode === 'url') {
        setUrlInput(text.trim());
      }
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="py-12 sm:py-16">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 space-y-8">
        {/* Main Editorial Slogan Header with strong visual weight */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-brand-ink tracking-tight leading-[1.12]">
            La forma más rápida de<br className="hidden sm:inline" />
            {' '}publicar <span className="text-brand-primary">noticias</span> en redes sociales
          </h1>
          <p className="text-sm sm:text-lg text-brand-navy/70 font-normal leading-relaxed max-w-3xl">
            Titular convierte artículos periodísticos en publicaciones listas para compartir, manteniendo la identidad de tu medio.
          </p>
        </div>

        {/* Source Selector & Input Area */}
        <div className="space-y-4 pt-1">
          {/* Source Tabs */}
          <div>
            <label className="block text-[11px] font-semibold text-brand-navy/60 mb-2 uppercase tracking-wider font-mono">
              Fuente
            </label>
            <div className="inline-flex items-center rounded-lg bg-white border border-brand-navy/15 p-1 gap-1">
              <button
                type="button"
                onClick={() => setImportMode('url')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  importMode === 'url'
                    ? 'bg-brand-primary text-brand-ink font-semibold shadow-xs'
                    : 'text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5'
                }`}
              >
                <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>URL Web</span>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('pdf')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  importMode === 'pdf'
                    ? 'bg-brand-primary text-brand-ink font-semibold shadow-xs'
                    : 'text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5'
                }`}
              >
                <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('word')}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  importMode === 'word'
                    ? 'bg-brand-primary text-brand-ink font-semibold shadow-xs'
                    : 'text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5'
                }`}
              >
                <FileCode className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Word (.docx)</span>
              </button>
            </div>
          </div>

          {/* TAB 1: URL FORM */}
          {importMode === 'url' && (
            <form onSubmit={handleSubmitUrl} className="space-y-2">
              <label className="block text-xs font-medium text-brand-navy/80">
                URL de la noticia
              </label>
              <div className="flex flex-col sm:flex-row gap-2 items-stretch">
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-brand-navy/50">
                    <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <input
                    type="url"
                    required
                    placeholder="https://ejemplo.com/noticia-completa"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-md border border-brand-navy/20 bg-white py-3 pl-9 sm:pl-10 pr-20 text-sm sm:text-base text-brand-ink placeholder-brand-navy/40 transition-colors focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary/60 font-normal"
                  />
                  {!urlInput && !isLoading && (
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="absolute inset-y-0 right-1.5 my-auto flex h-7 items-center gap-1 text-[11px] text-brand-navy/60 hover:text-brand-navy px-2 rounded bg-brand-navy/5 hover:bg-brand-navy/10 transition-colors cursor-pointer"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      <span>Pegar</span>
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !urlInput.trim()}
                  className="flex h-11 sm:h-12 items-center justify-center gap-1.5 rounded-md bg-brand-primary hover:bg-brand-primary-hover px-5 text-sm sm:text-base font-medium text-brand-ink shadow-xs focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 shrink-0 transition-colors cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <span>Procesar noticia</span>
                  )}
                </button>
              </div>

              {/* Discreet sample trigger */}
              {!urlInput && SAMPLE_NEWS && SAMPLE_NEWS.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSampleDropdown(!showSampleDropdown)}
                    className="text-xs text-brand-navy/60 hover:text-brand-primary-deep transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <span>Probar con un ejemplo</span>
                    <span className="text-[10px] text-brand-navy/50">{showSampleDropdown ? '▲' : '▼'}</span>
                  </button>

                  {showSampleDropdown && (
                    <div className="mt-2 p-2 rounded-md bg-white border border-brand-navy/15 space-y-1 max-w-lg animate-fade-in shadow-lg">
                      <span className="text-[11px] text-brand-navy/50 block px-2 pb-1 font-medium">
                        Seleccioná una noticia de prueba:
                      </span>
                      {SAMPLE_NEWS.slice(0, 3).map((sample, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setShowSampleDropdown(false);
                            onSelectSample(sample);
                          }}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-brand-navy/5 text-xs text-brand-navy/80 hover:text-brand-ink transition-colors cursor-pointer flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{sample.title}</span>
                          <span className="text-[10px] text-brand-navy/50 shrink-0 font-mono">{sample.publisher}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>
          )}

          {/* TAB 2 & 3: DOCUMENT UPLOAD */}
          {(importMode === 'pdf' || importMode === 'word') && (
            <form onSubmit={handleSubmitDocument} className="space-y-3">
              <label className="block text-xs font-medium text-brand-navy/80">
                Archivo {importMode === 'pdf' ? 'PDF' : 'Word (.docx)'}
              </label>
              <div className="border border-dashed border-brand-navy/25 hover:border-brand-primary/50 rounded-md bg-white p-6 text-center cursor-pointer relative transition-colors">
                <input
                  type="file"
                  accept={importMode === 'pdf' ? '.pdf' : '.docx,.doc'}
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="h-6 w-6 text-brand-navy/60 mx-auto mb-2" />
                <p className="text-xs font-medium text-brand-ink">
                  Seleccioná o arrastrá el archivo {importMode === 'pdf' ? 'PDF' : 'Word (.docx)'}
                </p>
                <p className="text-[11px] text-brand-navy/50 mt-0.5">
                  El contenido será estructurado para generar las piezas editoriales de tu medio.
                </p>
              </div>

              {docContent && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-brand-navy/60">
                    Contenido extraído del archivo:
                  </span>
                  <textarea
                    rows={3}
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    className="w-full rounded-md border border-brand-navy/20 bg-white p-2.5 text-xs text-brand-ink focus:outline-none focus:border-brand-primary font-normal"
                  />
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isLoading || !docContent.trim()}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-brand-primary hover:bg-brand-primary-hover px-4 text-xs sm:text-sm font-medium text-brand-ink disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>Procesar documento</span>
                </button>
              </div>
            </form>
          )}

          {/* Error Alert */}
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-normal">
              <strong className="font-semibold text-rose-800">Error:</strong> {error}
            </div>
          )}

          {/* Loading Progress State */}
          {isLoading && (
            <div className="rounded-md border border-brand-navy/10 bg-white p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-brand-navy/80">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary-deep" />
                  {loadingStep || 'Procesando noticia...'}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-brand-navy/10">
                <div className="h-full bg-brand-primary animate-pulse w-3/4 rounded-full" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};




