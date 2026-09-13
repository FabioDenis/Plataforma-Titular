import React, { useState } from 'react';
import {
  Layers,
  Move,
  Maximize2,
  Trash2,
  Plus,
  Copy,
  Type,
  Image as ImageIcon,
  Building2,
  Tag,
  Calendar,
  User,
  Settings,
  Sliders,
  Check,
  Zap,
  Upload,
  Eye,
  ChevronRight,
  Sparkles,
  Palette,
  QrCode,
  FileText,
  Target,
  RefreshCw,
  X,
  Lock,
} from 'lucide-react';
import {
  OfficialTemplate,
  TemplateElement,
  TemplateElementType,
  TemplateElementProperties,
} from '../types';
import { useAuth } from '../context/AuthContext';

interface InteractiveTemplateEditorProps {
  template: OfficialTemplate;
  onSave: (updatedTemplate: OfficialTemplate) => void;
  onClose: () => void;
  orgName?: string;
}

const ELEMENT_TYPE_LABELS: Record<TemplateElementType, { label: string; icon: any; color: string }> = {
  title: { label: 'Título Principal', icon: Type, color: 'border-emerald-500 bg-emerald-500/20 text-emerald-300' },
  subtitle: { label: 'Subtítulo / Bajada', icon: FileText, color: 'border-blue-500 bg-blue-500/20 text-blue-300' },
  image: { label: 'Fotografía Principal', icon: ImageIcon, color: 'border-amber-500 bg-amber-500/20 text-amber-300' },
  logo: { label: 'Logo Oficial', icon: Building2, color: 'border-purple-500 bg-purple-500/20 text-purple-300' },
  category: { label: 'Categoría / Sección', icon: Tag, color: 'border-rose-500 bg-rose-500/20 text-rose-300' },
  author: { label: 'Autor / Periodista', icon: User, color: 'border-indigo-500 bg-indigo-500/20 text-indigo-300' },
  date: { label: 'Fecha / Hora', icon: Calendar, color: 'border-cyan-500 bg-cyan-500/20 text-cyan-300' },
  footer: { label: 'Pie de Página / Firma', icon: Layers, color: 'border-zinc-500 bg-zinc-500/20 text-zinc-300' },
  free_text: { label: 'Texto Libre', icon: Type, color: 'border-teal-500 bg-teal-500/20 text-teal-300' },
  qr_code: { label: 'Código QR', icon: QrCode, color: 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-300' },
  fixed_element: { label: 'Elemento Fijo', icon: Lock, color: 'border-slate-500 bg-slate-500/20 text-slate-300' },
  dynamic_element: { label: 'Elemento Dinámico', icon: Zap, color: 'border-orange-500 bg-orange-500/20 text-orange-300' },
};

const CATEGORY_OPTIONS = [
  'General',
  'Política',
  'Economía',
  'Deportes',
  'Salud',
  'Educación',
  'Judiciales',
  'Policiales',
  'Institucional',
  'Último Momento',
  'Tecnología',
  'Internacionales',
  'Cultura',
  'Sociedad',
  'Tránsito',
];

export const InteractiveTemplateEditor: React.FC<InteractiveTemplateEditorProps> = ({
  template,
  onSave,
  onClose,
  orgName,
}) => {
  const { authFetch } = useAuth();
  const [currentTemplate, setCurrentTemplate] = useState<OfficialTemplate>(() => {
    // Normalize elements array if empty
    if (!template.elements || template.elements.length === 0) {
      const initialElems: TemplateElement[] = [
        {
          id: 'elem-title',
          name: 'Título Principal',
          type: 'title',
          x: template.titleBox?.x ?? 5,
          y: template.titleBox?.y ?? 65,
          width: template.titleBox?.width ?? 90,
          height: template.titleBox?.height ?? 20,
          zIndex: 10,
          properties: { maxLines: 3, maxWords: 9, alignment: 'left', color: '#FFFFFF', autoScale: true },
        },
        {
          id: 'elem-subtitle',
          name: 'Subtítulo / Bajada',
          type: 'subtitle',
          x: template.subtitleBox?.x ?? 5,
          y: template.subtitleBox?.y ?? 86,
          width: template.subtitleBox?.width ?? 90,
          height: template.subtitleBox?.height ?? 9,
          zIndex: 9,
          properties: { maxLines: 2, alignment: 'left', color: '#CBD5E1' },
        },
        {
          id: 'elem-image',
          name: 'Fotografía Principal',
          type: 'image',
          x: template.imageBox?.x ?? 0,
          y: template.imageBox?.y ?? 12,
          width: template.imageBox?.width ?? 100,
          height: template.imageBox?.height ?? 50,
          zIndex: 5,
          properties: { fitMode: 'cover', prioritySubject: 'auto' },
        },
        {
          id: 'elem-logo',
          name: 'Logo Oficial',
          type: 'logo',
          x: template.logoBox?.x ?? 70,
          y: template.logoBox?.y ?? 3,
          width: template.logoBox?.width ?? 25,
          height: template.logoBox?.height ?? 7,
          zIndex: 15,
          properties: { alignment: 'right' },
        },
        {
          id: 'elem-category',
          name: 'Categoría / Sección',
          type: 'category',
          x: template.categoryBox?.x ?? 5,
          y: template.categoryBox?.y ?? 3,
          width: template.categoryBox?.width ?? 30,
          height: template.categoryBox?.height ?? 6,
          zIndex: 12,
          properties: { uppercase: true, backgroundColor: template.primaryColor || '#2563eb', color: '#FFFFFF' },
        },
      ];
      return { ...template, elements: initialElems };
    }
    return template;
  });

  const [selectedElemId, setSelectedElemId] = useState<string>(
    currentTemplate.elements?.[0]?.id || 'elem-title'
  );
  const [activeTab, setActiveTab] = useState<'canvas' | 'settings' | 'import'>('canvas');
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisSummary, setAnalysisSummary] = useState<string>('');

  const selectedElem = currentTemplate.elements?.find((e) => e.id === selectedElemId);

  // Update a single element's coordinates or properties
  const handleUpdateElement = (id: string, updates: Partial<TemplateElement>) => {
    if (!currentTemplate.elements) return;
    const updatedElems = currentTemplate.elements.map((elem) => {
      if (elem.id === id) {
        return { ...elem, ...updates };
      }
      return elem;
    });

    // Also update legacy box boundaries for compatibility
    const title = updatedElems.find((e) => e.type === 'title');
    const subtitle = updatedElems.find((e) => e.type === 'subtitle');
    const image = updatedElems.find((e) => e.type === 'image');
    const logo = updatedElems.find((e) => e.type === 'logo');
    const category = updatedElems.find((e) => e.type === 'category');

    setCurrentTemplate((prev) => ({
      ...prev,
      elements: updatedElems,
      titleBox: title ? { x: title.x, y: title.y, width: title.width, height: title.height } : prev.titleBox,
      subtitleBox: subtitle ? { x: subtitle.x, y: subtitle.y, width: subtitle.width, height: subtitle.height } : prev.subtitleBox,
      imageBox: image ? { x: image.x, y: image.y, width: image.width, height: image.height } : prev.imageBox,
      logoBox: logo ? { x: logo.x, y: logo.y, width: logo.width, height: logo.height } : prev.logoBox,
      categoryBox: category ? { x: category.x, y: category.y, width: category.width, height: category.height } : prev.categoryBox,
    }));
  };

  const handleUpdateElemProperties = (id: string, propUpdates: Partial<TemplateElementProperties>) => {
    if (!selectedElem) return;
    const newProps = { ...selectedElem.properties, ...propUpdates };
    handleUpdateElement(id, { properties: newProps });
  };

  // Add new element box
  const handleAddElement = (type: TemplateElementType) => {
    const meta = ELEMENT_TYPE_LABELS[type];
    const newElem: TemplateElement = {
      id: `elem-${type}-${Date.now()}`,
      name: `${meta.label} Custom`,
      type,
      x: 10,
      y: 10,
      width: 40,
      height: 10,
      zIndex: 10,
      properties: { alignment: 'left', color: '#FFFFFF' },
    };
    const updated = [...(currentTemplate.elements || []), newElem];
    setCurrentTemplate((prev) => ({ ...prev, elements: updated }));
    setSelectedElemId(newElem.id);
  };

  // Delete element box
  const handleDeleteElement = (id: string) => {
    const updated = (currentTemplate.elements || []).filter((e) => e.id !== id);
    setCurrentTemplate((prev) => ({ ...prev, elements: updated }));
    if (selectedElemId === id) {
      setSelectedElemId(updated[0]?.id || '');
    }
  };

  // Duplicate element box
  const handleDuplicateElement = (elem: TemplateElement) => {
    const dup: TemplateElement = {
      ...elem,
      id: `elem-${elem.type}-${Date.now()}`,
      name: `${elem.name} (Copia)`,
      x: Math.min(elem.x + 4, 90),
      y: Math.min(elem.y + 4, 90),
    };
    const updated = [...(currentTemplate.elements || []), dup];
    setCurrentTemplate((prev) => ({ ...prev, elements: updated }));
    setSelectedElemId(dup.id);
  };

  // Handle uploading reference template image or multi-sample posts
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setIsAnalyzing(true);
      const file = files[0];
      const reader = new FileReader();

      reader.onload = async (event) => {
        const base64 = event.target?.result as string;

        // Call backend Gemini AI analysis for bounding boxes
        const res = await authFetch('/api/analyze-template-image', {
          method: 'POST',
          body: JSON.stringify({
            imageBase64: base64,
            sampleCount: files.length,
            categoryName: currentTemplate.associatedCategories[0] || 'General',
            templateName: currentTemplate.name,
            orgName: orgName || 'Organización',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setAnalysisSummary(data.analysisSummary || 'Publicaciones analizadas con éxito.');

          // Update current template with AI detected boxes and colors
          setCurrentTemplate((prev) => ({
            ...prev,
            referenceImageUrl: base64,
            primaryColor: data.primaryColor || prev.primaryColor,
            secondaryColor: data.secondaryColor || prev.secondaryColor,
            fontFamily: data.fontFamily || prev.fontFamily,
            titleBox: data.titleBox || prev.titleBox,
            subtitleBox: data.subtitleBox || prev.subtitleBox,
            imageBox: data.imageBox || prev.imageBox,
            logoBox: data.logoBox || prev.logoBox,
            categoryBox: data.categoryBox || prev.categoryBox,
            dateBox: data.dateBox || prev.dateBox,
            elements: data.elements && data.elements.length > 0 ? data.elements : prev.elements,
          }));
        }
        setIsAnalyzing(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error procesando imagen:', err);
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-7xl rounded-2xl border border-zinc-800 bg-zinc-950 text-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* TOP BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600/20 p-2 border border-blue-500/30 text-blue-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentTemplate.name}
                  onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                  className="font-extrabold text-lg text-white bg-transparent border-b border-zinc-700 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                />
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  {currentTemplate.socialNetwork}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Editor Visual de Zonas Delimitadas (Figma / Canva Box Editor). Mueve y ajusta los bloques oficiales.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all border ${
                previewMode
                  ? 'bg-purple-600 text-white border-purple-400 shadow-lg shadow-purple-600/20'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
              }`}
            >
              <Eye className="h-4 w-4" />
              <span>{previewMode ? 'Vista Previa Con Texto' : 'Modo Estructura Cajas'}</span>
            </button>

            <button
              onClick={() => onSave(currentTemplate)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all"
            >
              <Check className="h-4 w-4" />
              <span>Guardar Plantilla Oficial</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* MAIN WORKSPACE GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* LEFT PANEL: ELEMENT BOXES LIST & ADD BUTTONS */}
          <div className="lg:col-span-3 border-r border-zinc-800 bg-zinc-900/60 p-4 space-y-4 overflow-y-auto text-xs">
            {/* Import Banner button */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-950/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-400" /> Analizar con IA:
                </span>
                {isAnalyzing && <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />}
              </div>
              <p className="text-[11px] text-zinc-400 leading-snug">
                Sube una imagen o de 5 a 20 placas de ejemplo para autodetectar la composición gráfica.
              </p>
              <label className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-bold text-white cursor-pointer hover:bg-blue-500 transition-all text-xs">
                <Upload className="h-3.5 w-3.5" />
                <span>Importar Imagen / Muestras</span>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {analysisSummary && (
                <div className="mt-2 text-[10px] font-semibold text-emerald-300 bg-emerald-950/50 p-2 rounded border border-emerald-800">
                  ✅ {analysisSummary}
                </div>
              )}
            </div>

            {/* Element Boxes Manager */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-300 uppercase tracking-wider text-[11px] flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-blue-400" /> Cajas Delimitadas ({currentTemplate.elements?.length || 0})
                </span>
              </div>

              <div className="space-y-1.5">
                {currentTemplate.elements?.map((elem) => {
                  const meta = ELEMENT_TYPE_LABELS[elem.type] || ELEMENT_TYPE_LABELS.title;
                  const Icon = meta.icon;
                  const isSelected = elem.id === selectedElemId;

                  return (
                    <div
                      key={elem.id}
                      onClick={() => setSelectedElemId(elem.id)}
                      className={`flex items-center justify-between rounded-xl p-2.5 border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-950/50 text-white shadow-md'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Icon className="h-4 w-4 shrink-0 text-blue-400" />
                        <span className="font-bold text-xs truncate">{elem.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateElement(elem);
                          }}
                          className="p-1 hover:text-blue-300 rounded"
                          title="Duplicar"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteElement(elem.id);
                          }}
                          className="p-1 hover:text-rose-400 rounded"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Add Elements Palette */}
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <span className="font-bold text-zinc-400 text-[11px] block uppercase">➕ Agregar Nueva Caja:</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(['title', 'subtitle', 'image', 'logo', 'category', 'date', 'author', 'free_text', 'qr_code'] as TemplateElementType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleAddElement(type)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] font-semibold text-zinc-300 hover:border-blue-500 hover:text-white transition-all text-left truncate"
                  >
                    <Plus className="h-3 w-3 text-blue-400 shrink-0" />
                    <span className="truncate">{ELEMENT_TYPE_LABELS[type].label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER PANEL: INTERACTIVE FIGMA/CANVA CANVAS */}
          <div className="lg:col-span-6 bg-zinc-950 p-6 flex flex-col items-center justify-center overflow-auto relative">
            <div className="text-center mb-3">
              <span className="text-[11px] font-mono text-zinc-500">
                Lienzo de Edición Oficial • {currentTemplate.socialNetwork} ({currentTemplate.socialNetwork === 'Story' ? '1080px × 1920px' : '1080px × 1350px'})
              </span>
            </div>

            {/* Canvas Container */}
            <div
              className="relative rounded-2xl border-2 border-dashed border-zinc-700 overflow-hidden shadow-2xl transition-all select-none"
              style={{
                width: currentTemplate.socialNetwork === 'Story' ? '360px' : currentTemplate.socialNetwork === 'Banner Web' ? '600px' : '360px',
                height: currentTemplate.socialNetwork === 'Story' ? '640px' : currentTemplate.socialNetwork === 'Banner Web' ? '337px' : '450px',
                backgroundColor: currentTemplate.secondaryColor || '#090d16',
                fontFamily: currentTemplate.fontFamily || 'Montserrat, sans-serif',
              }}
            >
              {/* Background Reference Image if uploaded */}
              {currentTemplate.referenceImageUrl && (
                <img
                  src={currentTemplate.referenceImageUrl}
                  alt="Plantilla base"
                  className="absolute inset-0 h-full w-full object-cover opacity-30 pointer-events-none"
                />
              )}

              {/* Top Accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5 z-30"
                style={{ backgroundColor: currentTemplate.primaryColor }}
              />

              {/* Render Interactive Bounding Boxes */}
              {currentTemplate.elements?.map((elem) => {
                const isSelected = elem.id === selectedElemId;
                const meta = ELEMENT_TYPE_LABELS[elem.type] || ELEMENT_TYPE_LABELS.title;

                return (
                  <div
                    key={elem.id}
                    onClick={() => setSelectedElemId(elem.id)}
                    className={`absolute transition-all cursor-move flex flex-col ${
                      isSelected
                        ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-black z-40 bg-blue-500/10'
                        : 'border border-dashed border-zinc-500/60 hover:border-blue-400 bg-black/20'
                    }`}
                    style={{
                      left: `${elem.x}%`,
                      top: `${elem.y}%`,
                      width: `${elem.width}%`,
                      height: `${elem.height}%`,
                      zIndex: elem.zIndex || 10,
                    }}
                  >
                    {/* Bounding Box Header Handle */}
                    <div className="flex items-center justify-between bg-black/80 px-1.5 py-0.5 text-[9px] font-mono text-zinc-300 font-bold border-b border-white/10 shrink-0">
                      <span className="truncate">{elem.name}</span>
                      <span className="text-zinc-500">{Math.round(elem.width)}%×{Math.round(elem.height)}%</span>
                    </div>

                    {/* Content Display according to Preview Mode */}
                    <div className="p-1 flex-1 flex items-center overflow-hidden">
                      {previewMode ? (
                        <div className="w-full h-full flex items-center">
                          {elem.type === 'title' && (
                            <span className="font-extrabold text-white text-xs leading-tight line-clamp-3">
                              Titular de Impacto para la Placa Oficial
                            </span>
                          )}
                          {elem.type === 'subtitle' && (
                            <span className="text-[10px] text-zinc-300 leading-snug line-clamp-2">
                              Bajada o síntesis noticiosa oficial configurada en la plantilla.
                            </span>
                          )}
                          {elem.type === 'image' && (
                            <div className="w-full h-full bg-zinc-800 rounded flex items-center justify-center text-zinc-500 text-[10px]">
                              🖼️ [Fotografía Noticia Real]
                            </div>
                          )}
                          {elem.type === 'logo' && (
                            <div className="w-full h-full flex items-center justify-end font-bold text-blue-400 text-[10px]">
                              🏢 {orgName || 'LOGO'}
                            </div>
                          )}
                          {elem.type === 'category' && (
                            <span className="bg-blue-600 text-white font-black text-[9px] px-2 py-0.5 rounded uppercase">
                              POLÍTICA
                            </span>
                          )}
                          {elem.type === 'date' && (
                            <span className="text-[9px] text-zinc-400 font-mono">22 de Julio de 2026</span>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-center">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.color}`}>
                            [{elem.name.toUpperCase()}]
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Resize Handles for selected box */}
                    {isSelected && (
                      <>
                        <div className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-blue-500 border border-white" />
                        <div className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500 border border-white" />
                        <div className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-blue-500 border border-white" />
                        <div className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500 border border-white" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT PANEL: SELECTED ELEMENT PROPERTY INSPECTOR */}
          <div className="lg:col-span-3 border-l border-zinc-800 bg-zinc-900/60 p-4 space-y-4 overflow-y-auto text-xs">
            {selectedElem ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <span className="font-extrabold text-sm text-white flex items-center gap-1.5">
                    <Sliders className="h-4 w-4 text-blue-400" /> Propiedades de Caja
                  </span>
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                    ID: {selectedElem.id.substring(0, 8)}
                  </span>
                </div>

                {/* Name & Type */}
                <div className="space-y-2">
                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Nombre de la Caja:</label>
                    <input
                      type="text"
                      value={selectedElem.name}
                      onChange={(e) => handleUpdateElement(selectedElem.id, { name: e.target.value })}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-white font-bold focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-400 font-bold mb-1">Tipo de Elemento:</label>
                    <select
                      value={selectedElem.type}
                      onChange={(e) => handleUpdateElement(selectedElem.id, { type: e.target.value as TemplateElementType })}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-white font-bold focus:border-blue-500 focus:outline-none"
                    >
                      {Object.entries(ELEMENT_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Precise Position & Dimensions (X, Y, Width, Height) */}
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <span className="font-bold text-zinc-300 block">📐 Posición y Tamaño (% Porcentaje):</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400">Eje X (% Horizontal):</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={selectedElem.x}
                        onChange={(e) => handleUpdateElement(selectedElem.id, { x: Number(e.target.value) })}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400">Eje Y (% Vertical):</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={selectedElem.y}
                        onChange={(e) => handleUpdateElement(selectedElem.id, { y: Number(e.target.value) })}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400">Ancho (% Width):</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={selectedElem.width}
                        onChange={(e) => handleUpdateElement(selectedElem.id, { width: Number(e.target.value) })}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400">Alto (% Height):</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={selectedElem.height}
                        onChange={(e) => handleUpdateElement(selectedElem.id, { height: Number(e.target.value) })}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Element Type Specific Inspector Rules */}
                {selectedElem.type === 'title' && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <span className="font-bold text-emerald-400 block">✍️ Reglas de Titular:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-zinc-400">Máx. Palabras:</label>
                        <input
                          type="number"
                          value={selectedElem.properties.maxWords || 8}
                          onChange={(e) => handleUpdateElemProperties(selectedElem.id, { maxWords: Number(e.target.value) })}
                          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-zinc-400">Máx. Líneas:</label>
                        <input
                          type="number"
                          value={selectedElem.properties.maxLines || 3}
                          onChange={(e) => handleUpdateElemProperties(selectedElem.id, { maxLines: Number(e.target.value) })}
                          className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {selectedElem.type === 'image' && (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <span className="font-bold text-amber-400 block">🖼️ Motor de Imagen:</span>
                    <div>
                      <label className="block text-[10px] text-zinc-400">Ajuste de Recorte:</label>
                      <select
                        value={selectedElem.properties.fitMode || 'cover'}
                        onChange={(e) => handleUpdateElemProperties(selectedElem.id, { fitMode: e.target.value as any })}
                        className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white font-bold"
                      >
                        <option value="cover">Crop Inteligente (Cover)</option>
                        <option value="contain">Ajustar Completo (Contain)</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Associated Categories Manager */}
                <div className="space-y-2 pt-3 border-t border-zinc-800">
                  <span className="font-bold text-zinc-300 block">🏷️ Secciones Asignadas a esta Plantilla:</span>
                  <div className="flex flex-wrap gap-1">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const isAssoc = currentTemplate.associatedCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            const newCats = isAssoc
                              ? currentTemplate.associatedCategories.filter((c) => c !== cat)
                              : [...currentTemplate.associatedCategories, cat];
                            setCurrentTemplate({ ...currentTemplate, associatedCategories: newCats });
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                            isAssoc
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-zinc-500">
                Selecciona una caja en el lienzo para ver y modificar sus propiedades.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
