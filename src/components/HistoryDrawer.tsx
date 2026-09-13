import React, { useState } from 'react';
import { X, Search, Trash2, Newspaper, ArrowRight } from 'lucide-react';
import { GeneratedNewsResult } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: GeneratedNewsResult[];
  onSelectResult: (result: GeneratedNewsResult) => void;
  onClearHistory: () => void;
  onDeleteResult: (id: string) => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelectResult,
  onClearHistory,
  onDeleteResult,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filtered = history.filter(
    (item) =>
      item.article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.article.publisher.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.posts.feed.headline.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-brand-ink/40 backdrop-blur-xs animate-fade-in">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-0 sm:pl-10">
        <div className="w-screen max-w-md border-l border-brand-navy/15 bg-white p-6 text-brand-ink shadow-raised flex flex-col justify-between">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-brand-navy/15">
              <div>
                <h3 className="text-base font-bold text-brand-ink flex items-center gap-2">
                  <Newspaper className="h-4 w-4 text-brand-primary-deep" />
                  Historial de Noticias
                </h3>
                <p className="text-xs text-brand-navy/60 font-normal">
                  {history.length} noticias procesadas en sesión
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-brand-navy/60 hover:bg-brand-navy/5 hover:text-brand-ink transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search input */}
            <div className="my-4 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-brand-navy/60" />
              <input
                type="text"
                placeholder="Buscar por título o medio..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-brand-navy/15 bg-white py-2 pl-9 pr-4 text-xs text-brand-ink placeholder-brand-navy/40 focus:border-brand-primary focus:outline-none font-medium"
              />
            </div>

            {/* List */}
            <div className="space-y-2.5 max-h-[calc(100vh-250px)] overflow-y-auto pr-1 scrollbar-thin">
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-brand-navy/60 text-xs font-normal">
                  {searchQuery ? 'No se encontraron resultados.' : 'Aún no has generado noticias.'}
                </div>
              ) : (
                filtered.map((item) => (
                  <div
                    key={item.id}
                    className="group relative rounded-lg border border-brand-navy/15 bg-brand-navy/5 p-3.5 hover:border-brand-navy/40 transition-all text-left shadow-md"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                        {item.article.publisher || 'Medio'}
                      </span>
                      <span className="text-[10px] text-brand-navy/60 font-mono font-medium">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-brand-ink line-clamp-2 leading-snug">
                      {item.posts.feed.headline || item.article.title}
                    </p>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-brand-navy/15">
                      <button
                        onClick={() => {
                          onSelectResult(item);
                          onClose();
                        }}
                        className="flex items-center gap-1 text-xs text-brand-primary-deep font-bold hover:underline cursor-pointer"
                      >
                        <span>Cargar esta noticia</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteResult(item.id);
                        }}
                        className="text-brand-navy/60 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                        title="Eliminar registro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          {history.length > 0 && (
            <div className="pt-4 border-t border-brand-navy/15">
              <button
                onClick={onClearHistory}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-all cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Vaciar Todo el Historial</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

