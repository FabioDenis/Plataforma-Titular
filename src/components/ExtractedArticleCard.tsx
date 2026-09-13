import React, { useState } from 'react';
import { Newspaper, Calendar, User, FileText, ChevronDown, ChevronUp, ExternalLink, ShieldCheck } from 'lucide-react';
import { NewsArticleData } from '../types';

interface ExtractedArticleCardProps {
  article: NewsArticleData;
}

export const ExtractedArticleCard: React.FC<ExtractedArticleCardProps> = ({ article }) => {
  const [showFullContent, setShowFullContent] = useState(false);

  const wordCount = article.content ? article.content.split(/\s+/).length : 0;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="rounded-xl border border-brand-navy/15 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-navy/15 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-navy/5 px-2.5 py-1 text-xs font-semibold text-brand-ink border border-brand-navy/15">
              <Newspaper className="h-3.5 w-3.5 text-brand-primary-deep" />
              {article.publisher || 'Medio Digital'}
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
              {article.category || 'General'}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-brand-navy/60">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-brand-navy/60" />
              {article.publishedAt}
            </span>
            {article.author && (
              <span className="hidden sm:flex items-center gap-1">
                <User className="h-3.5 w-3.5 text-brand-navy/60" />
                {article.author}
              </span>
            )}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brand-primary-deep hover:underline font-semibold"
              title="Ver fuente original"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Enlace</span>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
          {/* Main Image Preview */}
          {article.mainImage && (
            <div className="md:col-span-1 relative rounded-lg overflow-hidden border border-brand-navy/15 aspect-video md:aspect-square bg-white group">
              <img
                src={article.mainImage}
                alt={article.title}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80';
                }}
              />
              <div className="absolute top-2 left-2 rounded bg-brand-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-brand-ink border border-white/20">
                Imagen Principal
              </div>
            </div>
          )}

          {/* Title, Subtitle, Info */}
          <div className={article.mainImage ? 'md:col-span-3' : 'md:col-span-4'}>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-brand-ink leading-snug">
              {article.title}
            </h2>
            {article.subtitle && (
              <p className="mt-2 text-xs sm:text-sm text-brand-navy/80 leading-relaxed font-normal">
                {article.subtitle}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-brand-navy/60">
              <span className="flex items-center gap-1 rounded-md bg-brand-navy/5 px-2.5 py-1 text-brand-navy/80 border border-brand-navy/15 font-medium">
                <FileText className="h-3.5 w-3.5 text-brand-navy/60" />
                {wordCount} palabras (~{readTime} min lectura)
              </span>
              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Publicidad y scripts eliminados
              </span>
            </div>

            {/* Toggle Full Cleaned Article Body */}
            <div className="mt-4 pt-3 border-t border-brand-navy/15">
              <button
                onClick={() => setShowFullContent(!showFullContent)}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary-deep hover:text-brand-primary transition-colors cursor-pointer"
              >
                {showFullContent ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    <span>Ocultar texto periodístico extraído</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    <span>Ver texto completo de la noticia extraída</span>
                  </>
                )}
              </button>

              {showFullContent && (
                <div className="mt-3 rounded-lg border border-brand-navy/15 bg-white p-4 text-xs text-brand-navy leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap font-sans">
                  {article.content}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


