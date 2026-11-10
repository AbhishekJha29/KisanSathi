export type Theme = 'light' | 'dark';

export type PageId = 'home' | 'get-advice' | 'results' | 'crop-library' | 'about';

// --- Form Options API Types (GET /api/options) ---

export interface OptionItem {
  id: string;
  nameEn: string;
}

export interface StateOption {
  name: string;
  region: string;
}

export interface OptionsResponse {
  soils: OptionItem[];
  seasons: OptionItem[];
  waterSources: OptionItem[];
  units: OptionItem[];
  states: StateOption[];
}

// --- Crop Catalog API Types (GET /api/crops, GET /api/crops/:id) ---

export interface CropSummary {
  id: string;
  nameEn: string;
  scientificName: string;
  badge: string;
  badgeType: string;
  varietyTag: string;
  tagline: string;
  idealSoil: string;
  duration: string;
  waterNeed: string;
  waterLevel: 'very-low' | 'low' | 'medium' | 'high' | string;
  metricTitle: string;
  metricValue: string;
  hubs: string;
  description: string;
  descriptionEn?: string;
  avgYield: string;
  expectedYield?: string;
  marketPrice: string;
  mandiPriceRange?: string;
  imageUrl: string;
  imageAlt: string;
  category: string[];
  popularityScore: number;
  profitScore: number;
  durationDays: number;
  seasons: string[];
  soils: string[];
}

export interface CropsResponse {
  count: number;
  crops: CropSummary[];
}

export interface FertilizerStageItem {
  stageOrder: number;
  stageEn: string;
  timingEn: string;
  fertilizerEn: string;
  quantityPerAcre: string;
  applicationMethod: string;
}

export interface CropIrrigationDetail {
  frequencyEn: string;
  criticalStagesEn: string;
  runtimePerZone: string;
  waterConserved: string;
  tipsEn: string;
}

export interface PestDiseaseItem {
  id: number;
  nameEn: string;
  symptomsEn: string;
  controlEn: string;
  severity: string;
  type: string;
}

export interface CropHarvestStepItem {
  stepOrder: number;
  letter: string;
  titleEn: string;
  textEn: string;
}

export interface CropDetail extends CropSummary {
  seedRate: string;
  sowingDepth: string;
  spacing: string;
  harvestingIndicator: string;
  introTipEn: string;
  efficiencyGain: string;
  micronutrientNote: string;
  stagnationAlert: string;
  fertilizerStages: FertilizerStageItem[];
  irrigation: CropIrrigationDetail | null;
  pestsDiseases: PestDiseaseItem[];
  harvestSteps: CropHarvestStepItem[];
  // Optional fields for interim backwards-compatibility during migration
  fertilizerDose?: {
    basal: string;
    top1: string;
    top2: string;
  };
  keyPests?: string[];
}

/**
 * Union alias representing either full crop details or summary for components.
 */
export type CropInfo = CropDetail;

// --- Advisory Request & Response Types (POST /api/advisory) ---

export interface AdvisoryFormData {
  crop: string;
  soilType: string;
  season: string;
  state: string;
  district: string;
  block?: string;
  waterSource: string;
  landSize: number;
  landUnit: 'acres' | 'bigha' | 'hectares' | string;
  farmerName?: string;
}

export interface FertilizerPlanItem {
  stage: string;
  fertilizerName: string;
  qtyPerAcre: string;
  applicationMethod: string;
}

export interface MoistureStageItem {
  step: number;
  title: string;
  status: string;
}

export interface PestAlertItem {
  name: string;
  severity: string;
  symptoms: string;
  control: string;
}

export interface HarvestStepItem {
  letter: string;
  title: string;
  desc: string;
}

export interface MandiRateItem {
  cropName: string;
  variety: string;
  marketYard: string;
  rateRange: string;
  trend: string;
  trendText: string;
}

export interface AdvisoryResultData {
  fieldData: AdvisoryFormData;
  generatedDate: string;
  zoneName: string;
  personalizedIntro: string;
  seasonWarning?: string;
  soilWarning?: string;
  efficiencyGain: string;
  fertilizerPlan: FertilizerPlanItem[];
  micronutrientNote: string;
  irrigationFrequency: string;
  waterConserved: string;
  runtimePerZone: string;
  moistureStages: MoistureStageItem[];
  stagnationAlert: string;
  pests: PestAlertItem[];
  harvestSteps: HarvestStepItem[];
  expectedYield: string;
  mandiRates: MandiRateItem[];
}

// --- AI Explanation & Chat Types (POST /api/advisory/explain, POST /api/chat) ---

export type AiSource = 'ai' | 'fallback';

export interface ExplainResponse {
  explanation: string;
  source: AiSource;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatResponse {
  answer: string;
  source: AiSource;
}
