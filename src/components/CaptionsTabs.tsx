import React, { useState } from 'react';
import { Copy, Check, Instagram, Facebook, Edit2, Share2 } from 'lucide-react';
import { SocialPostsOutput } from '../types';

interface CaptionsTabsProps {
  posts: SocialPostsOutput;
}

export const CaptionsTabs: React.FC<CaptionsTabsProps> = ({ posts }) => {
  const [activePlatform, setActivePlatform] = useState<'instagram' | 'facebook'>('instagram');
  const [copied, setCopied] = useState(false);

  // Allow inline editing of captions
  const [instagramCaption, setInstagramCaption] = useState(posts.instagram?.caption || '');
  const [facebookCaption, setFacebookCaption] = useState(posts.facebook?.caption || '');

  // Sync state if posts prop changes
  React.useEffect(() => {
    setInstagramCaption(posts.instagram?.caption || '');
    setFacebookCaption(posts.facebook?.caption || '');
  }, [posts]);

  const getCurrentCaption = () => {
    switch (activePlatform) {
      case 'instagram':
        return instagramCaption;
      case 'facebook':
        return facebookCaption;
    }
  };

  const setCurrentCaption = (text: string) => {
    switch (activePlatform) {
      case 'instagram':
        setInstagramCaption(text);
        break;
      case 'facebook':
        setFacebookCaption(text);
        break;
    }
  };

  const handleCopy = () => {
    const textToCopy = getCurrentCaption();
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentText = getCurrentCaption();
  const charCount = currentText.length;
  const wordCount = currentText.split(/\s+/).filter(Boolean).length;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="rounded-xl border border-brand-navy/15 bg-white p-5 shadow-card">
        {/* Platform Selection Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-brand-navy/15 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-brand-ink flex items-center gap-2">
              <Share2 className="h-4 w-4 text-brand-primary-deep" />
              Textos Adaptados para Redes Sociales
            </h3>
            <p className="text-xs text-brand-navy/60 mt-0.5 font-normal">
              Redacción periodística optimizada para canales de difusión institucionales
            </p>
          </div>

          {/* Platform Switcher Buttons */}
          <div className="flex rounded-lg bg-brand-navy/5 p-1 border border-brand-navy/15">
            <button
              onClick={() => setActivePlatform('instagram')}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activePlatform === 'instagram'
                  ? 'bg-brand-primary text-brand-ink shadow-xs'
                  : 'text-brand-navy/60 hover:text-brand-ink'
              }`}
            >
              <Instagram className="h-3.5 w-3.5 text-brand-ink" />
              <span>Instagram</span>
            </button>

            <button
              onClick={() => setActivePlatform('facebook')}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                activePlatform === 'facebook'
                  ? 'bg-brand-primary text-brand-ink shadow-xs'
                  : 'text-brand-navy/60 hover:text-brand-ink'
              }`}
            >
              <Facebook className="h-3.5 w-3.5 text-brand-ink" />
              <span>Facebook</span>
            </button>
          </div>
        </div>

        {/* Caption Content Area */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-brand-navy/60">
            <span className="flex items-center gap-1.5 font-sans text-brand-navy font-semibold">
              <Edit2 className="h-3.5 w-3.5 text-brand-primary-deep" />
              Texto para {activePlatform.toUpperCase()} (editable):
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono font-medium text-brand-navy/60">
              <span>{charCount} caracteres</span>
              <span>•</span>
              <span>{wordCount} palabras</span>
            </div>
          </div>

          {/* Text Area */}
          <textarea
            rows={7}
            value={currentText}
            onChange={(e) => setCurrentCaption(e.target.value)}
            className="w-full rounded-lg border border-brand-navy/15 bg-white p-3.5 text-xs text-brand-ink leading-relaxed font-sans placeholder-brand-navy/40 focus:border-brand-primary focus:outline-none transition-colors resize-y font-medium"
          />

          {/* Copy Action Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <p className="text-xs text-brand-navy/60">
              Estilo Periodístico:{' '}
              <span className="font-semibold text-brand-navy">
                {activePlatform === 'instagram' && 'Síntesis ejecutiva con hashtags de categoría'}
                {activePlatform === 'facebook' && 'Desarrollo explicativo e informativo'}
              </span>
            </p>

            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-brand-ink transition-all cursor-pointer shrink-0 ${
                copied
                  ? 'bg-emerald-600'
                  : 'bg-brand-primary hover:bg-brand-primary-hover'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Copiado al portapapeles</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copiar Texto ({activePlatform.toUpperCase()})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


