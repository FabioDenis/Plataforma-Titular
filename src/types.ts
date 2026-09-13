export const DEFAULT_TRIAL_PUBLICATION_LIMIT = 3;

export type OrgType =
  | 'Diario'
  | 'Medio Digital'
  | 'Empresa'
  | 'Municipalidad'
  | 'Universidad'
  | 'Ministerio'
  | 'ONG'
  | 'Consultora';

export type TemplateElementType =
  | 'title'
  | 'subtitle'
  | 'image'
  | 'logo'
  | 'category'
  | 'author'
  | 'date'
  | 'footer'
  | 'free_text'
  | 'qr_code'
  | 'fixed_element'
  | 'dynamic_element';

export interface TemplateElementProperties {
  maxLines?: number;
  maxWords?: number;
  alignment?: 'left' | 'center' | 'right' | 'justify';
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  autoScale?: boolean;
  uppercase?: boolean;

  // Image properties
  fitMode?: 'cover' | 'contain' | 'crop_smart';
  zoom?: number;
  prioritySubject?: 'face' | 'center' | 'top' | 'auto';

  // Styling & Background
  backgroundColor?: string;
  paddingPx?: number;
  borderRadiusPx?: number;
  borderColor?: string;
  borderWidthPx?: number;
  shadow?: string;

  // Logo / Badge specific
  maxScale?: number;

  // Free text / Custom
  customText?: string;
}

export interface TemplateElement {
  id: string;
  name: string;
  type: TemplateElementType;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  zIndex?: number;
  properties: TemplateElementProperties;
}

export interface TemplateBox {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
}

export interface OfficialTemplate {
  id: string;
  name: string;
  description: string;
  associatedCategories: string[];
  socialNetwork: 'Instagram Feed' | 'Story' | 'Facebook' | 'LinkedIn' | 'Banner Web' | 'General' | string;
  referenceImageUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  borderRadiusPx: number;
  titleBox: TemplateBox;
  subtitleBox: TemplateBox;
  imageBox: TemplateBox;
  logoBox: TemplateBox;
  categoryBox: TemplateBox;
  dateBox?: TemplateBox;
  authorBox?: TemplateBox;
  elements?: TemplateElement[];
  maxTitleWords?: number;
  maxSubtitleLines?: number;
}

export interface TemplateVariant {
  id: string;
  name: string;
  categories: string[];
  primaryColor: string;
  secondaryColor: string;
  styleTag: string;
}

export interface VisualPatternProfile {
  logoDetected: boolean;
  logoPosition: 'Inferior Derecha' | 'Inferior Izquierda' | 'Superior Izquierda' | 'Superior Derecha' | 'Centro' | string;
  categoryPosition: 'Superior Izquierda' | 'Superior Derecha' | 'Sobre Titulo' | string;
  primaryColor: string;
  secondaryColor: string;
  estimatedFont: string;
  maxTitleWords: number;
  maxSubtitleLines: number;
  imageRatioPercent: number;
  textRatioPercent: number;
  borderRadiusPx: number;
  borderStyle: string;
  shadowStyle: string;
  compositionStyle: string;
  visualConfidence: number;
  templateVariants: TemplateVariant[];
}

export interface EditorialPatternProfile {
  tone: string;
  formalityLevel: 'Alta' | 'Media' | 'Informal' | string;
  averageParagraphs: number;
  emojiUsage: 'Ninguno' | 'Moderado' | 'Frecuente' | string;
  hashtagStyle: string;
  callToAction: string;
  writingStyleSummary: string;
  editorialConfidence: number;
}

export interface OrganizationIdentity {
  id: string;
  name: string;
  orgType: OrgType;
  logoUrl?: string;
  websiteUrl?: string;
  instagramHandle?: string;
  visual: VisualPatternProfile;
  editorial: EditorialPatternProfile;
  officialTemplates?: OfficialTemplate[];
  activeOfficialTemplateId?: string;
  activeOfficialTemplateName?: string;
  activeOfficialTemplateCustomization?: any;
  sampleImagesCount: number;
  sampleCaptionsCount: number;
  isTrained: boolean;
  updatedAt: string;
}

export interface NewsArticleData {
  url?: string;
  title: string;
  subtitle: string;
  content: string;
  mainImage: string;
  category: string;
  publishedAt: string;
  author: string;
  publisher: string;
  importSourceType?: 'url' | 'text' | 'document' | 'image';
}

export interface SocialPostsOutput {
  feed: {
    category: string;
    headline: string;
    subtitle: string;
  };
  story: {
    headline: string;
    subtitle: string;
  };
  instagram: {
    caption: string;
  };
  facebook: {
    caption: string;
  };
  linkedin: {
    caption: string;
  };
  hashtags: string[];
  keywords: string[];
  priority: 'Alta' | 'Media' | 'Baja' | string;
  confidence: number;
  identityMatchScore?: number;
  appliedTemplateName?: string;
  suggested_template?: string;
}

export interface OutletBranding {
  name: string;
  logoUrl?: string;
  accentColor: string;
  themeStyle: 'dark' | 'light' | 'vibrant';
}

export interface GeneratedNewsResult {
  id: string;
  createdAt: string;
  article: NewsArticleData;
  posts: SocialPostsOutput;
  branding: OutletBranding;
  identityUsed?: OrganizationIdentity;
  selectedTemplate?: OfficialTemplate;
}

export type TemplateStyle = 'editorial-clean' | 'breaking-news' | 'dark-executive' | 'modern-accent' | 'minimal-light' | 'learned-dna' | 'official-template';

export interface SampleNewsItem {
  id: string;
  publisher: string;
  category: string;
  url: string;
  title: string;
  subtitle: string;
  content: string;
  mainImage: string;
  publishedAt: string;
  author: string;
}

export type CustomTemplateZoneType = 'logo' | 'category' | 'title' | 'subtitle' | 'image' | 'domain';

export interface CustomTemplateElement {
  type: CustomTemplateZoneType;
  x: number;      // 0.0 to 1.0 (relative)
  y: number;      // 0.0 to 1.0 (relative)
  width: number;  // 0.0 to 1.0 (relative)
  height: number; // 0.0 to 1.0 (relative)
  active: boolean;
}

export interface CustomMediaTemplate {
  id: string;
  name: string;
  referenceImageUrl: string;
  canvas: {
    width: number;
    height: number;
  };
  elements: CustomTemplateElement[];
  createdAt: string;
}

// ==========================================
// REAL SOCIAL MEDIA PUBLISHING (META GRAPH API)
// ==========================================

export type PublicationLifecycleStatus =
  | 'BORRADOR'
  | 'EN REVISIÓN'
  | 'APROBADO'
  | 'PUBLICANDO'
  | 'PUBLICADO'
  | 'ERROR';

export type SocialNetworkPublishStatus = 'idle' | 'pending' | 'published' | 'error';

export interface NetworkPublishResult {
  status: SocialNetworkPublishStatus;
  postId?: string;
  mediaId?: string;
  permalinkUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  publishedAt?: string;
}

export interface AdministeredPageItem {
  id: string;
  name: string;
  category?: string;
  tasks?: string[];
  instagramAccount?: {
    id: string;
    username: string;
    name?: string;
    profilePictureUrl?: string;
  };
}

export type HermesUserRole = 'admin' | 'owner' | 'editor' | 'approver';

export interface MetaConnectionStatus {
  isConfiguredOnServer: boolean;
  facebook: {
    connected: boolean;
    pageId?: string;
    pageName?: string;
    category?: string;
    connectedAt?: string;
    connectedBy?: string;
  };
  instagram: {
    connected: boolean;
    igUserId?: string;
    username?: string;
    name?: string;
    profilePictureUrl?: string;
    connectedAt?: string;
    connectedBy?: string;
    reason?: string;
  };
}

export interface PublicationRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  status: PublicationLifecycleStatus;
  approvedBy?: string;
  approvedAt?: string;
  publishedBy?: string;
  publishedAt?: string;
  createdAt: string;
  articleTitle: string;
  category: string;
  content: {
    headline: string;
    subtitle: string;
    facebookCaption: string;
    instagramCaption: string;
    imageUrl: string;
    format: 'feed' | 'story';
  };
  targets: {
    facebook: boolean;
    instagram: boolean;
  };
  results: {
    facebook?: NetworkPublishResult;
    instagram?: NetworkPublishResult;
  };
  scheduledPublishTime?: number | null;
}

// ==========================================
// ADMIN GENERATIONS MANAGEMENT
// ==========================================

export interface AdminUserRecord {
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
  userCreatedAt: string;
  organizationId: string;
  organizationName: string;
  status: string;
  plan: string;
  publicationLimit: number;
  publicationUsed: number;
  availableGenerations: number;
  orgCreatedAt: string;
}

export interface GenerationMovement {
  id: string;
  type: 'ADMIN_GRANT';
  amountAdded: number;
  previousPublicationLimit: number;
  newPublicationLimit: number;
  publicationUsed: number;
  previousAvailable: number;
  newAvailable: number;
  adminUid: string;
  adminEmail: string;
  createdAt: string;
  reason?: string;
}



