import React from 'react';
import { PresetTemplate } from '../data/presetTemplates';
import { Check, Sparkles } from 'lucide-react';

interface PresetTemplateCardProps {
  template: PresetTemplate;
  isSelected: boolean;
  onSelect: (template: PresetTemplate) => void;
}

export const PresetTemplateCard: React.FC<PresetTemplateCardProps> = ({
  template,
  isSelected,
  onSelect,
}) => {
  return (
    <button
      onClick={() => onSelect(template)}
      className={`group relative text-left rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between bg-zinc-950/90 ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-500/80 shadow-xl shadow-blue-950/40'
          : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80 hover:shadow-lg'
      }`}
    >
      {/* MINI VISUAL THUMBNAIL PREVIEW CONTAINER */}
      <div className="relative w-full h-28 bg-zinc-900 overflow-hidden border-b border-zinc-800/80 flex items-center justify-center p-2">
        {/* Sample Background Image Simulation */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-zinc-950 opacity-90" />

        {/* THUMBNAIL LAYOUT SCHEME BY TYPE */}
        {template.layoutType === 'editorial-clasico' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-zinc-700/60 shadow-inner flex flex-col justify-end p-2 bg-slate-900">
            {/* Background Simulated Image */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-900 to-black" />
            <div className="absolute top-1.5 left-2 h-1.5 w-6 rounded bg-blue-500/80" />
            <div className="relative z-10 space-y-1">
              <div className="h-1.5 w-8 rounded bg-blue-400" />
              <div className="h-2 w-3/4 rounded bg-white font-bold" />
              <div className="h-1.5 w-1/2 rounded bg-zinc-400" />
              <div className="h-1 w-full bg-blue-500/50 mt-1" />
            </div>
          </div>
        )}

        {template.layoutType === 'editorial-clean' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-zinc-700/60 shadow-inner flex flex-col bg-slate-100">
            {/* Top 45% Image */}
            <div className="h-[45%] w-full bg-gradient-to-r from-emerald-800 to-teal-900 relative">
              <div className="absolute top-1 left-1.5 h-1.5 w-4 rounded bg-emerald-400" />
            </div>
            {/* Floating Badge */}
            <div className="absolute top-[40%] left-3 -translate-y-1/2 h-2.5 px-1.5 rounded-full bg-emerald-600 border border-emerald-400 text-[6px] font-bold text-white flex items-center justify-center">
              CLEAN
            </div>
            {/* Bottom Panel */}
            <div className="h-[55%] w-full bg-white p-1.5 flex flex-col justify-between">
              <div className="space-y-0.5">
                <div className="h-1 w-10 bg-emerald-600/70 rounded" />
                <div className="h-2 w-4/5 bg-slate-900 rounded" />
                <div className="h-1 w-3/5 bg-slate-400 rounded" />
              </div>
              <div className="h-0.5 w-full bg-emerald-500" />
            </div>
          </div>
        )}

        {template.layoutType === 'breaking-news' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-red-950 shadow-inner flex flex-col justify-between p-1.5 bg-zinc-950">
            <div className="bg-red-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider self-start flex items-center gap-0.5">
              <span>🚨 URGENTE</span>
            </div>
            <div className="space-y-1 bg-red-950/80 p-1.5 rounded border border-red-600/40">
              <div className="h-2.5 w-full bg-white rounded font-black" />
              <div className="h-1.5 w-2/3 bg-red-200 rounded" />
            </div>
          </div>
        )}

        {template.layoutType === 'economia' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-amber-900/60 shadow-inner flex flex-col justify-end p-2 bg-slate-950">
            <div className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-amber-500" />
            <div className="bg-slate-900/90 p-1.5 rounded-lg border border-amber-500/30 space-y-1">
              <div className="h-1 w-10 bg-amber-400 rounded" />
              <div className="h-2 w-5/6 bg-amber-100 rounded" />
              <div className="h-0.5 w-full bg-amber-500/60" />
            </div>
          </div>
        )}

        {template.layoutType === 'deportes' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-green-900/60 shadow-inner flex flex-col justify-end p-2 bg-zinc-950">
            <div className="absolute top-1 right-2 bg-emerald-600 text-[6px] font-black text-white px-1 rounded -skew-x-12">
              SPORT
            </div>
            <div className="space-y-1 bg-green-950/90 p-1.5 rounded border border-green-500/40">
              <div className="h-2 w-full bg-emerald-300 rounded -skew-x-6" />
              <div className="h-1 w-2/3 bg-white rounded" />
            </div>
          </div>
        )}

        {template.layoutType === 'story-instagram' && (
          <div className="relative h-full w-14 rounded border border-purple-500/50 bg-purple-950 flex flex-col justify-between p-1">
            <div className="h-1 w-3 bg-purple-400 rounded" />
            <div className="bg-purple-900/90 p-1 rounded space-y-0.5">
              <div className="h-1 w-full bg-white rounded" />
              <div className="h-1 w-2/3 bg-purple-300 rounded" />
            </div>
            <div className="h-0.5 w-full bg-purple-400" />
          </div>
        )}

        {template.layoutType === 'tv-news' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-blue-900/60 shadow-inner flex flex-col justify-end p-1.5 bg-black">
            <div className="absolute top-1 left-2 bg-red-600 text-white text-[6px] font-bold px-1 rounded animate-pulse">
              ● EN VIVO
            </div>
            <div className="bg-blue-950 border-t-2 border-blue-500 p-1 space-y-0.5">
              <div className="h-1.5 w-full bg-white rounded" />
              <div className="h-1 w-3/4 bg-blue-300 rounded" />
            </div>
          </div>
        )}

        {template.layoutType === 'carrusel' && (
          <div className="relative w-full h-full rounded-lg overflow-hidden border border-purple-900/60 shadow-inner flex items-center justify-center gap-1 bg-slate-950 p-1">
            <div className="w-1/2 h-full bg-purple-900/60 rounded border border-purple-500/30 p-1 flex flex-col justify-end">
              <div className="h-1.5 w-full bg-white rounded" />
            </div>
            <div className="w-1/2 h-full bg-purple-950 rounded border border-purple-800/40 p-1 flex flex-col justify-end opacity-60">
              <div className="h-1.5 w-3/4 bg-purple-300 rounded" />
            </div>
          </div>
        )}

        {/* Selected Ribbon Badge */}
        {isSelected && (
          <div className="absolute top-2 right-2 bg-blue-600 text-white p-1 rounded-full shadow-lg ring-2 ring-blue-400">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* CARD INFO SECTION */}
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <h5 className="text-xs font-bold text-white line-clamp-1 group-hover:text-blue-300 transition-colors">
            {template.name}
          </h5>
          <span
            className="text-[9px] font-extrabold px-1.5 py-0.5 rounded text-white shrink-0"
            style={{ backgroundColor: template.badgeBg }}
          >
            {template.badgeText}
          </span>
        </div>
        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
          {template.description}
        </p>

        {isSelected && (
          <div className="pt-1 flex items-center gap-1 text-[10px] font-bold text-blue-400">
            <Sparkles className="h-3 w-3" />
            <span>Plantilla Activa</span>
          </div>
        )}
      </div>
    </button>
  );
};
