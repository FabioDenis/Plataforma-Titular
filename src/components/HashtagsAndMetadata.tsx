import React, { useState } from 'react';
import { Hash, Tag, Copy, Check } from 'lucide-react';
import { SocialPostsOutput, NewsArticleData } from '../types';

interface HashtagsAndMetadataProps {
  posts: SocialPostsOutput;
  article: NewsArticleData;
}

export const HashtagsAndMetadata: React.FC<HashtagsAndMetadataProps> = ({ posts, article }) => {
  const [copiedHashtags, setCopiedHashtags] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const handleCopyAllHashtags = () => {
    const text = posts.hashtags.join(' ');
    navigator.clipboard.writeText(text);
    setCopiedHashtags(true);
    setTimeout(() => setCopiedHashtags(false), 2000);
  };

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Hashtags Card */}
        <div className="rounded-xl border border-brand-navy/15 bg-white p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-brand-ink flex items-center gap-1.5">
              <Hash className="h-4 w-4 text-brand-primary-deep" />
              Hashtags Recomendados
            </h4>
            <button
              onClick={handleCopyAllHashtags}
              className="flex items-center gap-1 text-xs text-brand-primary-deep hover:text-brand-primary font-semibold cursor-pointer"
            >
              {copiedHashtags ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedHashtags ? 'Copiados' : 'Copiar Todos'}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {posts.hashtags.map((tag, idx) => (
              <button
                key={idx}
                onClick={() => handleCopyTag(tag)}
                className="inline-flex items-center gap-1 rounded-md border border-brand-navy/15 bg-white px-2.5 py-1 text-xs font-mono font-semibold text-blue-700 hover:border-brand-primary/50 hover:bg-brand-navy/10 transition-all cursor-pointer"
                title="Haz clic para copiar este hashtag"
              >
                <span>{tag}</span>
                {copiedTag === tag && <Check className="h-3 w-3 text-emerald-600" />}
              </button>
            ))}
          </div>
        </div>

        {/* Keywords Card */}
        <div className="rounded-xl border border-brand-navy/15 bg-white p-5 shadow-card">
          <h4 className="text-sm font-bold text-brand-ink flex items-center gap-1.5 mb-3">
            <Tag className="h-4 w-4 text-brand-primary-deep" />
            Palabras Clave (SEO)
          </h4>

          <div className="flex flex-wrap gap-2">
            {posts.keywords.map((kw, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-md border border-brand-navy/15 bg-white px-2.5 py-1 text-xs font-semibold text-brand-navy/80"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

