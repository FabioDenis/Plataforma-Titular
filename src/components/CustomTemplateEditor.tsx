import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Loader2,
  Check,
  X,
  RotateCcw,
  Sparkles,
  Move,
  Maximize2,
  Layers,
  CheckSquare,
  Square,
  Type,
  Image as ImageIcon,
  Tag,
  Globe,
  Award,
  Sliders,
  Save,
} from 'lucide-react';
import {
  CustomMediaTemplate,
  CustomTemplateElement,
  CustomTemplateZoneType,
} from '../types';
import { useAuth } from '../context/AuthContext';

interface CustomTemplateEditorProps {
  initialTemplate?: CustomMediaTemplate | null;
  onSave: (template: CustomMediaTemplate) => void;
  onCancel: () => void;
}

const ZONE_CONFIG: Record<
  CustomTemplateZoneType,
  {
    label: string;
    description: string;
    color: string;
    borderColor: string;
    bgColor: string;
    badgeBg: string;
    textColor: string;
    icon: React.ElementType;
  }
> = {
  logo: {
    label: 'Logo',
    description: 'Isotipo, logotipo o sello institucional del medio.',
    color: '#F59E0B',
    borderColor: 'border-amber-400',
    bgColor: 'bg-amber-500/20',
    badgeBg: 'bg-amber-500 text-slate-950',
    textColor: 'text-amber-400',
    icon: Award,
  },
  category: {
    label: 'Categoría',
    description: 'Sección o etiqueta de la noticia (ej. POLÍTICA).',
    color: '#10B981',
    borderColor: 'border-emerald-400',
    bgColor: 'bg-emerald-500/20',
    badgeBg: 'bg-emerald-500 text-slate-950',
    textColor: 'text-emerald-400',
    icon: Tag,
  },
  title: {
    label: 'Título',
    description: 'Titular principal o frase destacada de la placa.',
    color: '#3B82F6',
    borderColor: 'border-blue-400',
    bgColor: 'bg-blue-500/20',
    badgeBg: 'bg-blue-500 text-white',
    textColor: 'text-blue-400',
    icon: Type,
  },
  subtitle: {
    label: 'Subtítulo',
    description: 'Bajada, copete o resumen secundario explicativo.',
    color: '#8B5CF6',
    borderColor: 'border-purple-400',
    bgColor: 'bg-purple-500/20',
    badgeBg: 'bg-purple-500 text-white',
    textColor: 'text-purple-400',
    icon: Type,
  },
  image: {
    label: 'Imagen principal',
    description: 'Fotografía, ilustración o área gráfica principal.',
    color: '#F43F5E',
    borderColor: 'border-rose-400',
    bgColor: 'bg-rose-500/20',
    badgeBg: 'bg-rose-500 text-white',
    textColor: 'text-rose-400',
    icon: ImageIcon,
  },
  domain: {
    label: 'Dominio / Firma',
    description: 'Dirección web, red social o firma del medio.',
    color: '#14B8A6',
    borderColor: 'border-teal-400',
    bgColor: 'bg-teal-500/20',
    badgeBg: 'bg-teal-500 text-slate-950',
    textColor: 'text-teal-400',
    icon: Globe,
  },
};

const DEFAULT_ELEMENTS: CustomTemplateElement[] = [
  { type: 'logo', x: 0.08, y: 0.05, width: 0.20, height: 0.08, active: true },
  { type: 'category', x: 0.08, y: 0.28, width: 0.35, height: 0.05, active: true },
  { type: 'title', x: 0.08, y: 0.36, width: 0.84, height: 0.24, active: true },
  { type: 'subtitle', x: 0.08, y: 0.63, width: 0.80, height: 0.14, active: true },
  { type: 'image', x: 0.0, y: 0.12, width: 1.0, height: 0.24, active: true },
  { type: 'domain', x: 0.08, y: 0.90, width: 0.35, height: 0.05, active: true },
];

export const CustomTemplateEditor: React.FC<CustomTemplateEditorProps> = ({
  initialTemplate,
  onSave,
  onCancel,
}) => {
  const { authFetch } = useAuth();
  const [templateName, setTemplateName] = useState<string>(
    initialTemplate?.name || 'Plantilla Principal'
  );
  const [referenceImage, setReferenceImage] = useState<string | null>(
    initialTemplate?.referenceImageUrl || null
  );
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>(
    initialTemplate?.canvas || { width: 1080, height: 1080 }
  );
  const [elements, setElements] = useState<CustomTemplateElement[]>(
    initialTemplate?.elements || DEFAULT_ELEMENTS
  );

  const [selectedType, setSelectedType] = useState<CustomTemplateZoneType | null>('title');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Dragging & Resizing State
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    type: CustomTemplateZoneType;
    mode: 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';
    startX: number;
    startY: number;
    initialElem: CustomTemplateElement;
  } | null>(null);

  // Handle Image Upload & AI Detection
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setReferenceImage(base64);

      // Analyze image via Gemini Vision API
      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        const res = await authFetch('/api/analyze-custom-template', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: base64 }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.canvas) {
            setCanvasSize(data.canvas);
          }
          if (Array.isArray(data.elements) && data.elements.length > 0) {
            // Merge detected elements with defaults
            const updated = DEFAULT_ELEMENTS.map((def) => {
              const detected = data.elements.find(
                (e: any) => e.type === def.type || e.type?.toLowerCase() === def.type
              );
              if (detected) {
                return {
                  ...def,
                  x: Math.max(0, Math.min(1, detected.x ?? def.x)),
                  y: Math.max(0, Math.min(1, detected.y ?? def.y)),
                  width: Math.max(0.05, Math.min(1, detected.width ?? def.width)),
                  height: Math.max(0.02, Math.min(1, detected.height ?? def.height)),
                  active: true,
                };
              }
              return def;
            });
            setElements(updated);
          }
        } else {
          console.warn('Analysis endpoint returned error, using smart fallback layout.');
        }
      } catch (err) {
        console.error('Error analyzing template image:', err);
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Toggle Zone Active
  const toggleZoneActive = (type: CustomTemplateZoneType) => {
    setElements((prev) =>
      prev.map((el) => (el.type === type ? { ...el, active: !el.active } : el))
    );
  };

  // Direct element position updater
  const updateElementCoord = (
    type: CustomTemplateZoneType,
    field: 'x' | 'y' | 'width' | 'height',
    value: number
  ) => {
    setElements((prev) =>
      prev.map((el) => {
        if (el.type !== type) return el;
        const clamped = Math.max(0, Math.min(1, value));
        return { ...el, [field]: clamped };
      })
    );
  };

  // Mouse / Touch Drag Handlers
  const handlePointerDown = (
    e: React.PointerEvent,
    type: CustomTemplateZoneType,
    mode: 'move' | 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw'
  ) => {
    e.stopPropagation();
    setSelectedType(type);

    const elem = elements.find((el) => el.type === type);
    if (!elem || !elem.active) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setDragState({
      type,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialElem: { ...elem },
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const deltaXRel = (e.clientX - dragState.startX) / rect.width;
    const deltaYRel = (e.clientY - dragState.startY) / rect.height;

    const { type, mode, initialElem } = dragState;

    setElements((prev) =>
      prev.map((el) => {
        if (el.type !== type) return el;

        let newX = el.x;
        let newY = el.y;
        let newW = el.width;
        let newH = el.height;

        if (mode === 'move') {
          newX = Math.max(0, Math.min(1 - initialElem.width, initialElem.x + deltaXRel));
          newY = Math.max(0, Math.min(1 - initialElem.height, initialElem.y + deltaYRel));
        } else if (mode === 'resize-se') {
          newW = Math.max(0.05, Math.min(1 - initialElem.x, initialElem.width + deltaXRel));
          newH = Math.max(0.02, Math.min(1 - initialElem.y, initialElem.height + deltaYRel));
        } else if (mode === 'resize-sw') {
          const possibleX = Math.max(0, Math.min(initialElem.x + initialElem.width - 0.05, initialElem.x + deltaXRel));
          newW = initialElem.x + initialElem.width - possibleX;
          newX = possibleX;
          newH = Math.max(0.02, Math.min(1 - initialElem.y, initialElem.height + deltaYRel));
        } else if (mode === 'resize-ne') {
          newW = Math.max(0.05, Math.min(1 - initialElem.x, initialElem.width + deltaXRel));
          const possibleY = Math.max(0, Math.min(initialElem.y + initialElem.height - 0.02, initialElem.y + deltaYRel));
          newH = initialElem.y + initialElem.height - possibleY;
          newY = possibleY;
        } else if (mode === 'resize-nw') {
          const possibleX = Math.max(0, Math.min(initialElem.x + initialElem.width - 0.05, initialElem.x + deltaXRel));
          newW = initialElem.x + initialElem.width - possibleX;
          newX = possibleX;
          const possibleY = Math.max(0, Math.min(initialElem.y + initialElem.height - 0.02, initialElem.y + deltaYRel));
          newH = initialElem.y + initialElem.height - possibleY;
          newY = possibleY;
        }

        return {
          ...el,
          x: Math.round(newX * 1000) / 1000,
          y: Math.round(newY * 1000) / 1000,
          width: Math.round(newW * 1000) / 1000,
          height: Math.round(newH * 1000) / 1000,
        };
      })
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore pointer release error
      }
      setDragState(null);
    }
  };

  const handleSave = () => {
    if (!referenceImage) return;

    const newTemplate: CustomMediaTemplate = {
      id: initialTemplate?.id || `tpl_custom_${Date.now()}`,
      name: templateName.trim() || 'Plantilla Personalizada',
      referenceImageUrl: referenceImage,
      canvas: canvasSize,
      elements,
      createdAt: initialTemplate?.createdAt || new Date().toISOString(),
    };

    onSave(newTemplate);
  };

  const selectedElement = elements.find((el) => el.type === selectedType);

  return (
    <div className="space-y-6 text-slate-100">
      {/* HEADER & STEPS */}
      <div className="rounded-xl border border-[#1E2B42] bg-[#111726] p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
              Módulo de Identidad
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Configurador de Plantillas Personalizadas
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-normal">
            Subí una publicación de referencia de tu medio para detectar y ajustar las zonas de contenido.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-3.5 py-2 rounded-lg border border-[#23324D] bg-[#172033] hover:bg-[#1E2B42] text-xs font-semibold text-slate-300 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!referenceImage || isAnalyzing}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors shadow-lg shadow-blue-900/30 cursor-pointer flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            Guardar Plantilla
          </button>
        </div>
      </div>

      {/* TEMPLATE NAME INPUT */}
      <div className="rounded-xl border border-[#1E2B42] bg-[#111726] p-5 shadow-xl space-y-3">
        <label className="block text-xs font-bold text-slate-200">
          Nombre de la plantilla:
        </label>
        <input
          type="text"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="Ej. Plantilla Principal Instagram, Placa Noticiosa Feed..."
          className="w-full rounded-lg border border-[#23324D] bg-[#172033] px-3.5 py-2 text-xs font-semibold text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* MAIN WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: INTERACTIVE CANVAS VISUALIZER (7 COLS) */}
        <div className="lg:col-span-7 rounded-xl border border-[#1E2B42] bg-[#111726] p-5 shadow-xl flex flex-col items-center justify-center min-h-[480px]">
          {!referenceImage ? (
            /* UPLOAD DROPZONE */
            <div className="w-full py-16 px-6 text-center flex flex-col items-center justify-center border-2 border-dashed border-[#23324D] rounded-xl bg-[#151E2E]/60 space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
                <Upload className="h-8 w-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-sm font-bold text-white">Subir publicación de referencia</h3>
                <p className="text-xs text-slate-400 font-normal leading-relaxed">
                  Cargá una imagen (PNG o JPG) de una publicación real de tu medio para detectar automáticamente sus cuadrantes.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer transition-colors shadow-lg shadow-blue-900/20">
                <Upload className="h-4 w-4" />
                <span>Seleccionar Imagen</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            /* ACTIVE CANVAS VIEW */
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between border-b border-[#1E2B42] pb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span>Referencia Visual & Detección de Zonas</span>
                </div>

                <label className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Cambiar Imagen</span>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* OVERLAY WORKSPACE */}
              <div className="relative w-full flex items-center justify-center bg-slate-950/80 rounded-xl border border-[#23324D] p-3 overflow-hidden select-none">
                {isAnalyzing && (
                  <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
                    <p className="text-xs font-bold text-slate-100">
                      Analizando estructura visual con Gemini Vision...
                    </p>
                    <p className="text-[11px] text-slate-400 font-normal max-w-xs">
                      Detectando automáticamente la posición del logotipo, título, bajada e imagen principal.
                    </p>
                  </div>
                )}

                <div
                  ref={containerRef}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className="relative max-w-full h-auto max-h-[580px] shadow-2xl rounded overflow-hidden"
                  style={{
                    aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
                  }}
                >
                  {/* BACKGROUND REFERENCE IMAGE */}
                  <img
                    src={referenceImage}
                    alt="Referencia de plantilla"
                    className="w-full h-full object-contain pointer-events-none select-none"
                  />

                  {/* OVERLAID BOUNDING BOXES */}
                  {elements.map((elem) => {
                    if (!elem.active) return null;
                    const cfg = ZONE_CONFIG[elem.type];
                    const isSelected = selectedType === elem.type;

                    const leftPct = `${elem.x * 100}%`;
                    const topPct = `${elem.y * 100}%`;
                    const widthPct = `${elem.width * 100}%`;
                    const heightPct = `${elem.height * 100}%`;

                    return (
                      <div
                        key={elem.type}
                        onPointerDown={(e) => handlePointerDown(e, elem.type, 'move')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedType(elem.type);
                        }}
                        style={{
                          left: leftPct,
                          top: topPct,
                          width: widthPct,
                          height: heightPct,
                        }}
                        className={`absolute border-2 ${cfg.borderColor} ${
                          isSelected ? 'ring-2 ring-white/80 z-20' : 'z-10 hover:border-white'
                        } ${cfg.bgColor} transition-all duration-75 cursor-move flex flex-col justify-between p-1 group overflow-hidden shadow-lg`}
                      >
                        {/* TAG BADGE */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm flex items-center gap-1 ${cfg.badgeBg}`}
                          >
                            <cfg.icon className="h-2.5 w-2.5" />
                            <span>{cfg.label}</span>
                          </span>

                          <span className="text-[8px] font-mono font-bold text-white bg-slate-950/80 px-1 py-0.2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            {Math.round(elem.width * 100)}% × {Math.round(elem.height * 100)}%
                          </span>
                        </div>

                        {/* RESIZE CORNER HANDLE (SE) */}
                        <div
                          onPointerDown={(e) => handlePointerDown(e, elem.type, 'resize-se')}
                          className="absolute bottom-0 right-0 h-4 w-4 bg-white border border-slate-900 rounded-tl cursor-se-resize flex items-center justify-center opacity-80 hover:opacity-100 shadow-md"
                          title="Arrastrar para redimensionar"
                        >
                          <Maximize2 className="h-2.5 w-2.5 text-slate-900 rotate-90" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-normal px-1">
                <span className="flex items-center gap-1">
                  <Move className="h-3 w-3 text-blue-400" />
                  Arrastrá las cajas sobre la imagen para mover o redimensionar cada zona.
                </span>
                <span>Dimensión: {canvasSize.width} × {canvasSize.height} px</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CONTROLS & ZONE TOGGLES (5 COLS) */}
        <div className="lg:col-span-5 space-y-5">
          {/* ZONE SELECTION CHECKBOXES */}
          <div className="rounded-xl border border-[#1E2B42] bg-[#111726] p-5 shadow-xl space-y-4">
            <div className="pb-3 border-b border-[#1E2B42] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-400" />
                <h3 className="text-xs font-bold text-white">Zonas de Contenido Detectadas</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-normal">
                {elements.filter((e) => e.active).length} de 6 activas
              </span>
            </div>

            <div className="space-y-2">
              {elements.map((elem) => {
                const cfg = ZONE_CONFIG[elem.type];
                const isSelected = selectedType === elem.type;

                return (
                  <div
                    key={elem.type}
                    onClick={() => setSelectedType(elem.type)}
                    className={`rounded-lg border px-3 py-2.5 flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500/80 bg-[#172033]'
                        : 'border-[#23324D] bg-[#151E2E] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleZoneActive(elem.type);
                        }}
                        className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {elem.active ? (
                          <CheckSquare className={`h-4 w-4 ${cfg.textColor}`} />
                        ) : (
                          <Square className="h-4 w-4 text-slate-600" />
                        )}
                      </button>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: cfg.color }}
                          />
                          <span
                            className={`text-xs font-bold ${
                              elem.active ? 'text-white' : 'text-slate-500 line-through'
                            }`}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-normal">
                          {cfg.description}
                        </p>
                      </div>
                    </div>

                    {elem.active && (
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800">
                        X: {Math.round(elem.x * 100)}% | Y: {Math.round(elem.y * 100)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTIVE ELEMENT NUMERIC FINE-TUNING SLIDERS */}
          {selectedElement && selectedElement.active && (
            <div className="rounded-xl border border-[#1E2B42] bg-[#111726] p-5 shadow-xl space-y-4">
              <div className="pb-3 border-b border-[#1E2B42] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-white">
                    Ajuste Fino: {ZONE_CONFIG[selectedElement.type].label}
                  </h3>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    ZONE_CONFIG[selectedElement.type].badgeBg
                  }`}
                >
                  {ZONE_CONFIG[selectedElement.type].label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 font-medium mb-1">
                    <span>Posición Horizontal (X):</span>
                    <span className="font-mono text-blue-400">
                      {Math.round(selectedElement.x * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1 - selectedElement.width}
                    step={0.005}
                    value={selectedElement.x}
                    onChange={(e) =>
                      updateElementCoord(selectedElement.type, 'x', parseFloat(e.target.value))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-medium mb-1">
                    <span>Posición Vertical (Y):</span>
                    <span className="font-mono text-blue-400">
                      {Math.round(selectedElement.y * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1 - selectedElement.height}
                    step={0.005}
                    value={selectedElement.y}
                    onChange={(e) =>
                      updateElementCoord(selectedElement.type, 'y', parseFloat(e.target.value))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-medium mb-1">
                    <span>Ancho (W):</span>
                    <span className="font-mono text-blue-400">
                      {Math.round(selectedElement.width * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1 - selectedElement.x}
                    step={0.005}
                    value={selectedElement.width}
                    onChange={(e) =>
                      updateElementCoord(selectedElement.type, 'width', parseFloat(e.target.value))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-medium mb-1">
                    <span>Alto (H):</span>
                    <span className="font-mono text-blue-400">
                      {Math.round(selectedElement.height * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.02}
                    max={1 - selectedElement.y}
                    step={0.005}
                    value={selectedElement.height}
                    onChange={(e) =>
                      updateElementCoord(selectedElement.type, 'height', parseFloat(e.target.value))
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
