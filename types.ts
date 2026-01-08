
export interface GeneratedImage {
  id: string;
  url: string;
  type: 'full' | 'people' | 'construction';
  description: string;
  refineNote?: string;
}

export interface EtsyMetadata {
  title: string;
  description: string;
  tags: string;
  materials: string;
}

export interface HistoryItem {
  rowIndex: number;
  time: string;
  username: string;
  sku: string;
  etsyTitle: string;
  etsyDescription: string;
  tags: string;
  materials: string;
  originalImage: string;
  results: string[]; // Sẽ chứa 9 URL
}

export interface User {
  username: string;
  role: 'admin' | 'user';
  status?: 'pending' | 'approved';
}

export interface AppState {
  user: User | null;
  originalImage: string | null;
  isAnalyzing: boolean;
  isGenerating: boolean;
  isGeneratingMetadata: boolean;
  productDescription: string;
  results: GeneratedImage[];
  error: string | null;
  environment: 'indoor' | 'outdoor';
  sku: string;
  etsyMetadata: EtsyMetadata | null;
}
