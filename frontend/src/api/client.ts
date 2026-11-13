/**
 * API client module for KisanSathi.
 *
 * Provides typed fetch utilities to communicate with the Flask backend.
 */
import {
  AdvisoryFormData,
  AdvisoryResultData,
  ChatMessage,
  ChatResponse,
  CropDetail,
  CropsResponse,
  ExplainResponse,
  OptionsResponse,
} from '../types';

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  time: string;
}

/**
 * Custom API Error class representing failed backend requests.
 * Captures HTTP status code and optional validation field error dictionary.
 */
export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
    if (status === 400 && fields && Object.keys(fields).length > 0) {
      console.error('API 400 validation fields error:', fields);
    }
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Shared request helper for backend communications.
 * Uses AbortController with a 15-second default timeout, sets JSON headers,
 * transforms non-2xx responses into ApiError using backend 'error' and 'fields',
 * and maps network failures or timeouts to ApiError with status 0.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { timeoutMs = 15000, signal: externalSignal, headers, ...restOptions } = options;

  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let onExternalAbort: (() => void) | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      onExternalAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onExternalAbort);
    }
  }

  try {
    const response = await fetch(path, {
      ...restOptions,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(restOptions.body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    });

    if (!response.ok) {
      let errorMessage = response.statusText || `Request failed with status ${response.status}`;
      let errorFields: Record<string, string> | undefined;

      try {
        const errorData = await response.json();
        if (errorData && typeof errorData === 'object') {
          if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          }
          if (errorData.fields && typeof errorData.fields === 'object') {
            errorFields = errorData.fields as Record<string, string>;
          }
        }
      } catch {
        // Body is not JSON; fallback to statusText
      }

      if (response.status === 400 && errorFields) {
        console.error('API request failed with 400 validation error:', errorFields);
      }

      throw new ApiError(errorMessage, response.status, errorFields);
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }

    // Preserve cancellation errors triggered by callers to ignore stale requests
    if (externalSignal?.aborted && !timedOut) {
      throw err;
    }

    // Network failures, connection refused, or timeouts
    throw new ApiError('Cannot reach the server', 0);
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Make a typed GET request to the backend API.
 *
 * @param path The API endpoint path, e.g. '/api/health'
 * @param options Additional request options including AbortSignal
 * @returns The parsed JSON response cast to type T
 * @throws ApiError when the server responds with a non-2xx status code or network fails
 */
export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return apiRequest<T>(path, { ...options, method: 'GET' });
}

/**
 * Check backend API health status.
 *
 * Calls /api/health and returns true if the service is online and healthy,
 * or false otherwise. This function is guaranteed never to throw.
 *
 * @returns Promise<boolean> true if backend is online and healthy, false otherwise
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const data = await apiGet<HealthResponse>('/api/health', { timeoutMs: 5000 });
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

let cachedOptions: OptionsResponse | null = null;
let optionsPromise: Promise<OptionsResponse> | null = null;

/**
 * Retrieve form dropdown options from the backend.
 * Caches the response in memory so it is only fetched once per page load.
 *
 * @param options Optional request options including AbortSignal
 * @returns Promise<OptionsResponse> Soils, seasons, water sources, units, and states
 */
export async function getOptions(options?: RequestOptions): Promise<OptionsResponse> {
  if (cachedOptions) {
    return cachedOptions;
  }
  if (!optionsPromise) {
    optionsPromise = apiGet<OptionsResponse>('/api/options', options)
      .then((res) => {
        cachedOptions = res;
        optionsPromise = null;
        return res;
      })
      .catch((err) => {
        optionsPromise = null;
        throw err;
      });
  }
  return optionsPromise;
}

/**
 * Retrieve crop summaries with optional season filtering and search query.
 * Builds query strings using URLSearchParams and encodeURIComponent.
 *
 * @param params Optional season and search filters
 * @param options Optional request options including AbortSignal
 * @returns Promise<CropsResponse> Matching crop summaries and total count
 */
export async function getCrops(
  params?: { season?: string; search?: string },
  options?: RequestOptions
): Promise<CropsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.season && params.season.trim()) {
    searchParams.set('season', params.season.trim());
  }
  if (params?.search && params.search.trim()) {
    searchParams.set('search', params.search.trim());
  }
  const queryString = searchParams.toString();
  const path = queryString ? `/api/crops?${queryString}` : '/api/crops';
  return apiGet<CropsResponse>(path, options);
}

/**
 * Retrieve complete nested detail for a specific crop by its unique identifier.
 *
 * @param id Unique crop slug identifier (e.g. 'wheat')
 * @param options Optional request options including AbortSignal
 * @returns Promise<CropDetail> Full nested crop agronomic details
 */
export async function getCrop(id: string, options?: RequestOptions): Promise<CropDetail> {
  return apiGet<CropDetail>(`/api/crops/${encodeURIComponent(id.trim())}`, options);
}

/**
 * Clean and normalize advisory form data for API submission.
 *
 * Returns a sanitized copy containing ONLY the fields accepted by backend validation:
 *   - crop, soilType, season, state, district, landSize (number), landUnit, waterSource
 *   - block and farmerName ONLY when they are non-empty strings after trimming.
 * Drops null, undefined, whitespace-only values, and extra fields (e.g. 'soil').
 *
 * @param form Raw form data from UI state or advisory.fieldData
 * @returns Clean form payload matching backend schema
 */
export function buildFormPayload(form: any): Record<string, any> {
  if (!form || typeof form !== 'object') {
    return {};
  }

  const payload: Record<string, any> = {};

  // 1. crop
  if (form.crop !== undefined && form.crop !== null) {
    const cropStr = String(form.crop).trim();
    if (cropStr) payload.crop = cropStr;
  }

  // 2. soilType (handles soilType or legacy soil key, output is strictly soilType)
  const rawSoil = form.soilType !== undefined && form.soilType !== null
    ? form.soilType
    : form.soil;
  if (rawSoil !== undefined && rawSoil !== null) {
    const soilStr = String(rawSoil).trim();
    if (soilStr) payload.soilType = soilStr;
  }

  // 3. season
  if (form.season !== undefined && form.season !== null) {
    const seasonStr = String(form.season).trim();
    if (seasonStr) payload.season = seasonStr;
  }

  // 4. state
  if (form.state !== undefined && form.state !== null) {
    const stateStr = String(form.state).trim();
    if (stateStr) payload.state = stateStr;
  }

  // 5. district
  if (form.district !== undefined && form.district !== null) {
    const districtStr = String(form.district).trim();
    if (districtStr) payload.district = districtStr;
  }

  // 6. landSize (number)
  if (form.landSize !== undefined && form.landSize !== null && form.landSize !== '') {
    const num = typeof form.landSize === 'number' ? form.landSize : Number(form.landSize);
    if (!isNaN(num)) {
      payload.landSize = num;
    }
  }

  // 7. landUnit
  if (form.landUnit !== undefined && form.landUnit !== null) {
    const unitStr = String(form.landUnit).trim();
    if (unitStr) payload.landUnit = unitStr;
  }

  // 8. waterSource
  if (form.waterSource !== undefined && form.waterSource !== null) {
    const waterStr = String(form.waterSource).trim();
    if (waterStr) payload.waterSource = waterStr;
  }

  // 9. block (ONLY when non-empty string after trimming)
  if (form.block !== undefined && form.block !== null && typeof form.block === 'string') {
    const trimmedBlock = form.block.trim();
    if (trimmedBlock) {
      payload.block = trimmedBlock;
    }
  }

  // 10. farmerName (ONLY when non-empty string after trimming)
  if (form.farmerName !== undefined && form.farmerName !== null && typeof form.farmerName === 'string') {
    const trimmedFarmer = form.farmerName.trim();
    if (trimmedFarmer) {
      payload.farmerName = trimmedFarmer;
    }
  }

  return payload;
}

/**
 * Generate tailored crop advisory report from field parameters.
 *
 * @param form Farmer field parameters
 * @param options Optional request options including AbortSignal
 * @returns Promise<AdvisoryResultData> Full advisory result from the backend engine
 */
export async function postAdvisory(
  form: AdvisoryFormData,
  options?: RequestOptions
): Promise<AdvisoryResultData> {
  const cleanForm = buildFormPayload(form);
  return apiRequest<AdvisoryResultData>('/api/advisory', {
    ...options,
    method: 'POST',
    body: JSON.stringify(cleanForm),
  });
}

/**
 * Request natural language explanation of the generated crop advisory.
 *
 * @param form Farmer field parameters
 * @param options Optional request options including AbortSignal
 * @returns Promise<ExplainResponse> Synthesized explanation and source ('ai' or 'fallback')
 */
export async function postExplain(
  form: AdvisoryFormData,
  options?: RequestOptions
): Promise<ExplainResponse> {
  const cleanForm = buildFormPayload(form);
  return apiRequest<ExplainResponse>('/api/advisory/explain', {
    ...options,
    method: 'POST',
    body: JSON.stringify({ form: cleanForm }),
  });
}

/**
 * Send a follow-up agronomic question to the AI assistant.
 *
 * @param form Farmer field parameters
 * @param question Farmer question text (max 500 characters)
 * @param history Recent conversation messages (max 6 items)
 * @param options Optional request options including AbortSignal
 * @returns Promise<ChatResponse> Grounded answer and source ('ai' or 'fallback')
 */
export async function postChat(
  form: AdvisoryFormData,
  question: string,
  history: ChatMessage[],
  options?: RequestOptions
): Promise<ChatResponse> {
  const cleanForm = buildFormPayload(form);
  const cleanHistory = (history || [])
    .slice(-6)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    .map((m) => ({
      role: m.role,
      text: m.text.trim(),
    }))
    .filter((m) => m.text.length > 0);

  return apiRequest<ChatResponse>('/api/chat', {
    ...options,
    method: 'POST',
    body: JSON.stringify({ form: cleanForm, question: (question || '').trim(), history: cleanHistory }),
  });
}

