import React, { useState, useEffect, useRef } from 'react';
import {
  PageId,
  AdvisoryFormData,
  AdvisoryResultData,
  OptionsResponse,
  CropSummary,
} from '../types';
import { getOptions, getCrops, postAdvisory, ApiError } from '../api/client';
import { speakText, stopSpeaking } from '../utils/speechUtils';

interface GetAdvicePageProps {
  formData: AdvisoryFormData;
  onUpdateFormData: (data: AdvisoryFormData) => void;
  onSubmitAdvice: (data: AdvisoryFormData, result: AdvisoryResultData) => void;
  onNavigate: (page: PageId) => void;
}

export const GetAdvicePage: React.FC<GetAdvicePageProps> = ({
  formData,
  onUpdateFormData,
  onSubmitAdvice,
  onNavigate,
}) => {
  const [localData, setLocalData] = useState<AdvisoryFormData>(formData);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [prefillFlash, setPrefillFlash] = useState(false);

  // Form options state loaded from the backend API
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [cropsList, setCropsList] = useState<CropSummary[]>([]);
  const [isOptionsLoading, setIsOptionsLoading] = useState<boolean>(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Form submission state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // AbortController refs to prevent memory leaks and cancel stale in-flight requests
  const optionsAbortRef = useRef<AbortController | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setLocalData(formData);
  }, [formData]);

  // Load form options and crops from the API on mount
  const loadOptions = () => {
    if (optionsAbortRef.current) {
      optionsAbortRef.current.abort();
    }
    const controller = new AbortController();
    optionsAbortRef.current = controller;

    setIsOptionsLoading(true);
    setOptionsError(null);

    Promise.all([
      getOptions({ signal: controller.signal }),
      getCrops(undefined, { signal: controller.signal }),
    ])
      .then(([optRes, cropsRes]) => {
        if (!controller.signal.aborted) {
          setOptions(optRes);
          setCropsList(cropsRes.crops || []);
          setIsOptionsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setIsOptionsLoading(false);
          const friendly =
            err instanceof ApiError && err.status === 0
              ? 'Cannot reach the server. Please ensure the backend is running and retry.'
              : 'Failed to load options from the server. Please retry.';
          setOptionsError(friendly);
        }
      });
  };

  useEffect(() => {
    loadOptions();
    return () => {
      optionsAbortRef.current?.abort();
      submitAbortRef.current?.abort();
      stopSpeaking();
    };
  }, []);

  const handleFieldChange = <K extends keyof AdvisoryFormData>(key: K, value: AdvisoryFormData[K]) => {
    const updated = { ...localData, [key]: value };
    setLocalData(updated);
    onUpdateFormData(updated);

    // Clear matching field error when user modifies the input
    if (fieldErrors[key as string] || (key === 'soilType' && fieldErrors.soil)) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[key as string];
        delete copy.soil;
        return copy;
      });
    }
  };

  const handlePreFillSample = () => {
    const sample: AdvisoryFormData = {
      crop: cropsList.some((c) => c.id === 'wheat') ? 'wheat' : cropsList[0]?.id || 'wheat',
      soilType: options?.soils.some((s) => s.id === 'loamy') ? 'loamy' : options?.soils[0]?.id || 'loamy',
      season: options?.seasons.some((s) => s.id === 'rabi') ? 'rabi' : options?.seasons[0]?.id || 'rabi',
      state: options?.states.some((s) => s.name === 'Uttar Pradesh')
        ? 'Uttar Pradesh'
        : options?.states[0]?.name || 'Uttar Pradesh',
      district: 'Varanasi',
      block: 'Pindra',
      waterSource: options?.waterSources.some((w) => w.id === 'canal')
        ? 'canal'
        : options?.waterSources[0]?.id || 'canal',
      landSize: 5.0,
      landUnit: 'acres',
    };
    setLocalData(sample);
    onUpdateFormData(sample);
    setFieldErrors({});
    setErrorMessage(null);
    setPrefillFlash(true);
    setTimeout(() => setPrefillFlash(false), 600);
  };

  const handleReset = () => {
    const resetState: AdvisoryFormData = {
      crop: cropsList[0]?.id || 'wheat',
      soilType: options?.soils[0]?.id || 'loamy',
      season: options?.seasons[0]?.id || 'rabi',
      state: options?.states[0]?.name || 'Uttar Pradesh',
      district: '',
      block: '',
      waterSource: options?.waterSources[0]?.id || 'canal',
      landSize: 5.0,
      landUnit: 'acres',
    };
    setLocalData(resetState);
    onUpdateFormData(resetState);
    setFieldErrors({});
    setErrorMessage(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isLoading) return;

    // Client-side validation mirroring backend schema
    const clientErrors: Record<string, string> = {};
    if (!localData.crop || !localData.crop.trim()) {
      clientErrors.crop = 'Please select a crop.';
    }
    if (!localData.soilType || !localData.soilType.trim()) {
      clientErrors.soilType = 'Please select a soil type.';
    }
    if (!localData.season || !localData.season.trim()) {
      clientErrors.season = 'Please select a cropping season.';
    }
    if (!localData.state || !localData.state.trim()) {
      clientErrors.state = 'Please select a state.';
    }
    const trimmedDistrict = (localData.district || '').trim();
    if (!trimmedDistrict) {
      clientErrors.district = 'District is required.';
    } else if (trimmedDistrict.length > 100) {
      clientErrors.district = 'District cannot exceed 100 characters.';
    }
    const trimmedBlock = (localData.block || '').trim();
    if (trimmedBlock.length > 100) {
      clientErrors.block = 'Block cannot exceed 100 characters.';
    }
    const landNum = Number(localData.landSize);
    if (localData.landSize === undefined || localData.landSize === null || isNaN(landNum)) {
      clientErrors.landSize = 'Land size is required.';
    } else if (landNum <= 0) {
      clientErrors.landSize = 'Land size must be greater than 0.';
    } else if (landNum > 10000) {
      clientErrors.landSize = 'Land size cannot exceed 10,000.';
    }
    if (!localData.landUnit || !localData.landUnit.trim()) {
      clientErrors.landUnit = 'Please select a land unit.';
    }
    if (!localData.waterSource || !localData.waterSource.trim()) {
      clientErrors.waterSource = 'Please select a water source.';
    }

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      const firstKey = Object.keys(clientErrors)[0];
      const fieldMap: Record<string, string> = {
        crop: 'crop-selector',
        soilType: 'soil-type',
        soil: 'soil-type',
        season: 'season-group',
        state: 'state',
        district: 'district',
        block: 'block',
        waterSource: 'water-source',
        landSize: 'land-size',
        landUnit: 'land-unit',
      };
      const targetId = fieldMap[firstKey] || firstKey;
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus?.();
      }
      return;
    }

    // Abort older in-flight submission request to ignore stale responses
    if (submitAbortRef.current) {
      submitAbortRef.current.abort();
    }
    const controller = new AbortController();
    submitAbortRef.current = controller;

    setIsLoading(true);
    setErrorMessage(null);
    setFieldErrors({});

    try {
      const sanitizedPayload: AdvisoryFormData = {
        ...localData,
        district: trimmedDistrict,
        block: trimmedBlock || undefined,
      };
      const result = await postAdvisory(sanitizedPayload, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setIsLoading(false);
      onSubmitAdvice(sanitizedPayload, result);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setIsLoading(false);

      if (err instanceof ApiError) {
        if (err.fields && Object.keys(err.fields).length > 0) {
          setFieldErrors(err.fields);
          const firstKey = Object.keys(err.fields)[0];
          const fieldMap: Record<string, string> = {
            crop: 'crop-selector',
            soilType: 'soil-type',
            soil: 'soil-type',
            season: 'season-group',
            state: 'state',
            district: 'district',
            block: 'block',
            waterSource: 'water-source',
            landSize: 'land-size',
            landUnit: 'land-unit',
          };
          const targetId = fieldMap[firstKey] || firstKey;
          const element = document.getElementById(targetId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.focus?.();
          }
          return;
        }

        const friendlyMsg =
          err.status === 0
            ? 'Cannot reach the server. Please check your backend and try again.'
            : err.message || 'Could not generate advice. Please try again.';
        setErrorMessage(friendlyMsg);
      } else {
        setErrorMessage('Cannot reach the server. Please try again.');
      }
    }
  };

  const handleVoiceRead = () => {
    if (isAudioPlaying) {
      stopSpeaking();
      setIsAudioPlaying(false);
    } else {
      const text =
        'Enter your crop and field details to receive accurate scientific fertilizer and irrigation advice. Tailored recommendations are available for wheat, rice, cotton, maize, and more.';
      speakText(
        text,
        'en-IN',
        () => setIsAudioPlaying(true),
        () => setIsAudioPlaying(false)
      );
    }
  };

  // Normalized area text calculation
  const getNormalizedArea = () => {
    const size = Number(localData.landSize) || 0;
    if (localData.landUnit === 'acres') {
      const bigha = (size / 0.4).toFixed(1);
      const ha = (size * 0.404).toFixed(2);
      return `${size} Acres (${bigha} Bigha* / ${ha} Ha)`;
    } else if (localData.landUnit === 'bigha') {
      const acres = (size * 0.4).toFixed(2);
      const ha = (Number(acres) * 0.404).toFixed(2);
      return `${size} Bigha (${acres} Acres / ${ha} Ha)`;
    } else {
      const acres = (size * 2.471).toFixed(2);
      const bigha = (Number(acres) / 0.4).toFixed(1);
      return `${size} Hectares (${acres} Acres / ${bigha} Bigha*)`;
    }
  };

  // Crop list icons mapping
  const cropIconMap: Record<string, string> = {
    wheat: 'grass',
    rice: 'grain',
    cotton: 'filter_vintage',
    maize: 'eco',
    groundnut: 'spa',
    mustard: 'scatter_plot',
    soybean: 'yard',
    sugarcane: 'forest',
    chickpea: 'spa',
    potato: 'nutrition',
    onion: 'spa',
    tomato: 'temp_preferences_custom',
    cumin: 'scatter_plot',
    bajra: 'grain',
    castor: 'yard',
    fennel: 'spa',
    jowar: 'grass',
    pigeon_pea: 'spa',
  };

  return (
    <div className="flex flex-col w-full">
      <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Breadcrumb & Header Section */}
        <div className="flex flex-col gap-3">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
            <button
              onClick={() => onNavigate('home')}
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">home</span>
              <span>Home</span>
            </button>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold">
              Crop Advisory Engine
            </span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pt-1">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-surface-container px-3.5 py-1 rounded-full text-secondary mb-2 border border-outline-variant/30">
                <span className="material-symbols-outlined text-[18px]">verified</span>
                <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider">
                  Scientific Agro-Intelligence • ICAR &amp; KVK Model
                </span>
              </div>
              <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">
                Get Your Custom Crop Advisory
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant mt-2 max-w-2xl leading-relaxed">
                Provide your farming location and plot details below to calculate precise fertilizer ratios, irrigation schedules, and pest mitigation protocols tailored to Indian agro-climatic zones.
              </p>
            </div>

            <button
              onClick={handleVoiceRead}
              className="self-start lg:self-center shrink-0 flex items-center gap-2.5 bg-secondary-container text-on-secondary-fixed font-label-md text-label-md px-5 py-3 rounded-full shadow-sm hover:shadow-md active:scale-95 transition-all font-semibold"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px] text-secondary">
                {isAudioPlaying ? 'pause_circle' : 'volume_up'}
              </span>
              <span>
                {isAudioPlaying ? 'Playing...' : 'Listen (Audio Guide)'}
              </span>
            </button>
          </div>
        </div>

        {/* 2-Column Responsive Layout: 67% Form / 33% Companions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: The Interactive Advisory Form */}
          <section className="lg:col-span-8 flex flex-col gap-6">
            <div className="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 shadow-sm border border-outline-variant/30">
              {/* Stepper & Pre-fill Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 gap-3 border-b border-outline-variant/20">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center font-bold">
                    1
                  </span>
                  <div>
                    <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
                      Step 1 of 1
                    </span>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      Plot &amp; Sowing Specification
                    </h2>
                  </div>
                </div>

                <button
                  onClick={handlePreFillSample}
                  disabled={isOptionsLoading}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full font-label-sm text-label-sm transition-all border ${
                    prefillFlash
                      ? 'bg-primary-container text-on-primary border-primary'
                      : 'bg-surface-container text-primary hover:bg-surface-container-high border-outline-variant/30 font-semibold'
                  } disabled:opacity-50`}
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">magic_button</span>
                  <span>Load Sample Data</span>
                </button>
              </div>

              {/* General Submission Error Banner */}
              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-error-container/40 border border-error/30 text-on-error-container flex items-start justify-between gap-3 shadow-sm animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-error text-2xl shrink-0 mt-0.5">
                      error
                    </span>
                    <div>
                      <p className="font-label-md text-label-md font-bold">
                        Notice
                      </p>
                      <p className="font-body-sm text-body-sm mt-0.5 leading-relaxed">
                        {errorMessage}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSubmit()}
                      className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm font-bold hover:bg-primary-container transition-colors shadow-sm"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setErrorMessage(null)}
                      className="p-1 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
                      aria-label="Dismiss error"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Options Loading Failure Banner */}
              {optionsError && !options && (
                <div className="mb-6 p-4 rounded-xl bg-error-container/40 border border-error/30 text-on-error-container flex items-start justify-between gap-3 shadow-sm animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-error text-2xl shrink-0 mt-0.5">
                      cloud_off
                    </span>
                    <div>
                      <p className="font-label-md text-label-md font-bold">
                        Options Loading Failed
                      </p>
                      <p className="font-body-sm text-body-sm mt-0.5 leading-relaxed">
                        {optionsError}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={loadOptions}
                    className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm font-bold hover:bg-primary-container transition-colors shadow-sm shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Skeleton State while Options are loading */}
              {isOptionsLoading && !options ? (
                <div className="space-y-6 py-4 animate-pulse">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant">
                    <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0"></span>
                    <span className="font-label-md text-label-md font-semibold">
                      Loading form options from server...
                    </span>
                  </div>
                  <div className="h-28 bg-surface-container-low rounded-xl"></div>
                  <div className="h-16 bg-surface-container-low rounded-xl"></div>
                  <div className="h-16 bg-surface-container-low rounded-xl"></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-16 bg-surface-container-low rounded-xl"></div>
                    <div className="h-16 bg-surface-container-low rounded-xl"></div>
                  </div>
                </div>
              ) : (
                /* Form Body */
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* FIELD 1: Crop Selection Visual Selector */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-primary text-[20px]">psychiatry</span>
                        <span>
                          Select Targeted Crop{' '}
                          <span className="text-secondary font-semibold">
                            (Crop)
                          </span>
                        </span>
                        <span className="text-error font-bold">*</span>
                      </label>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {cropsList.length} Indian Crops
                      </span>
                    </div>

                    {/* Visual Horizontal Radio Badges for Top 8 Crops */}
                    {cropsList.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                        {cropsList.slice(0, 8).map((c) => {
                          const isSelected = localData.crop.toLowerCase() === c.id.toLowerCase();
                          const iconName = cropIconMap[c.id] || 'eco';
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleFieldChange('crop', c.id)}
                              className={`group flex items-center gap-2 p-3 rounded-xl text-left transition-all border ${
                                isSelected
                                  ? 'bg-primary-container text-on-primary shadow-sm border-primary ring-2 ring-primary/20'
                                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface border-outline-variant/20'
                              }`}
                            >
                              <span
                                className={`material-symbols-outlined text-[20px] ${
                                  isSelected ? 'text-on-primary' : 'text-secondary'
                                }`}
                              >
                                {iconName}
                              </span>
                              <div className="min-w-0">
                                <p className="font-label-md text-label-md font-bold truncate leading-tight">
                                  {c.nameEn}
                                </p>
                                <p className="font-label-sm text-label-sm opacity-90 truncate leading-tight">
                                  {c.varietyTag || c.scientificName}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Dropdown Selector for All Crops */}
                    <div className="mt-2 relative">
                      <select
                        id="crop-selector"
                        value={localData.crop}
                        onChange={(e) => handleFieldChange('crop', e.target.value)}
                        aria-describedby={fieldErrors.crop ? 'crop-error' : undefined}
                        aria-invalid={!!fieldErrors.crop}
                        className={`w-full h-[52px] px-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md appearance-none focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary pr-10 border cursor-pointer ${
                          fieldErrors.crop ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                        }`}
                      >
                        {cropsList.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nameEn} {c.varietyTag ? `- ${c.varietyTag}` : ''}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                        expand_more
                      </span>
                    </div>
                    {fieldErrors.crop && (
                      <p id="crop-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        <span>{fieldErrors.crop}</span>
                      </p>
                    )}
                  </div>

                  {/* FIELD 2: Soil Type Selection */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="soil-type" className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-primary text-[20px]">landslide</span>
                      <span>
                        Field Soil Characteristics{' '}
                        <span className="text-secondary font-semibold">
                          (Soil Type)
                        </span>
                      </span>
                      <span className="text-error font-bold">*</span>
                    </label>
                    <div className="relative">
                      <select
                        id="soil-type"
                        value={localData.soilType}
                        onChange={(e) => handleFieldChange('soilType', e.target.value)}
                        aria-describedby={fieldErrors.soilType || fieldErrors.soil ? 'soil-error' : undefined}
                        aria-invalid={!!(fieldErrors.soilType || fieldErrors.soil)}
                        className={`w-full h-[52px] px-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md appearance-none focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary pr-10 border cursor-pointer ${
                          fieldErrors.soilType || fieldErrors.soil ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                        }`}
                      >
                        {options?.soils.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nameEn}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                        expand_more
                      </span>
                    </div>
                    {(fieldErrors.soilType || fieldErrors.soil) && (
                      <p id="soil-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        <span>{fieldErrors.soilType || fieldErrors.soil}</span>
                      </p>
                    )}
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Soil texture directly determines basal fertilizer doses (N:P:K) and irrigation intervals.
                    </p>
                  </div>

                  {/* FIELD 3: Farming Season */}
                  <div className="flex flex-col gap-2" id="season-group">
                    <label className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-primary text-[20px]">routine</span>
                      <span>
                        Farming Cycle / Season{' '}
                        <span className="text-secondary font-semibold">
                          (Season)
                        </span>
                      </span>
                      <span className="text-error font-bold">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(options?.seasons || [
                        { id: 'kharif', nameEn: 'Kharif' },
                        { id: 'rabi', nameEn: 'Rabi' },
                        { id: 'zaid', nameEn: 'Zaid / Summer' },
                      ]).map((s) => {
                        const isSelected = localData.season.toLowerCase() === s.id.toLowerCase();
                        const icon = s.id === 'kharif' ? 'rainy' : s.id === 'rabi' ? 'ac_unit' : 'sunny';
                        const timingSub =
                          s.id === 'kharif'
                            ? 'Monsoon • Jun – Oct'
                            : s.id === 'rabi'
                            ? 'Winter • Oct – Mar'
                            : 'Summer • Mar – Jun';
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleFieldChange('season', s.id)}
                            className={`flex flex-col p-3.5 rounded-xl text-left transition-all border ${
                              isSelected
                                ? 'bg-primary-container text-on-primary shadow-sm border-primary ring-2 ring-primary/20'
                                : 'bg-surface-container hover:bg-surface-container-high text-on-surface border-outline-variant/20'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-label-md text-label-md font-bold">
                                {s.nameEn}
                              </span>
                              <span className="material-symbols-outlined text-[18px]">{icon}</span>
                            </div>
                            <span className="font-label-sm text-label-sm opacity-90">{timingSub}</span>
                          </button>
                        );
                      })}
                    </div>
                    {fieldErrors.season && (
                      <p id="season-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        <span>{fieldErrors.season}</span>
                      </p>
                    )}
                  </div>

                  {/* FIELD 4: State / UT and District */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="state" className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-primary text-[20px]">map</span>
                        <span>
                          State / UT{' '}
                          <span className="text-secondary font-semibold">
                            (State)
                          </span>
                        </span>
                        <span className="text-error font-bold">*</span>
                      </label>
                      <div className="relative">
                        <select
                          id="state"
                          value={localData.state}
                          onChange={(e) => handleFieldChange('state', e.target.value)}
                          aria-describedby={fieldErrors.state ? 'state-error' : undefined}
                          aria-invalid={!!fieldErrors.state}
                          className={`w-full h-[52px] px-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md appearance-none focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary pr-10 border cursor-pointer ${
                            fieldErrors.state ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                          }`}
                        >
                          {options?.states.map((st) => (
                            <option key={st.name} value={st.name}>
                              {st.name} ({st.region} Region)
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                          expand_more
                        </span>
                      </div>
                      {fieldErrors.state && (
                        <p id="state-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">error</span>
                          <span>{fieldErrors.state}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <label htmlFor="district" className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-primary text-[20px]">location_on</span>
                        <span>
                          District{' '}
                          <span className="text-secondary font-semibold">
                            (District)
                          </span>
                        </span>
                        <span className="text-error font-bold">*</span>
                      </label>
                      <div className="relative">
                        <input
                          id="district"
                          type="text"
                          maxLength={100}
                          value={localData.district}
                          onChange={(e) => handleFieldChange('district', e.target.value)}
                          aria-describedby={fieldErrors.district ? 'district-error' : undefined}
                          aria-invalid={!!fieldErrors.district}
                          placeholder="e.g. Varanasi, Ludhiana, Indore"
                          className={`w-full h-[52px] px-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary border ${
                            fieldErrors.district ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                          }`}
                        />
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                          edit_location
                        </span>
                      </div>
                      {fieldErrors.district && (
                        <p id="district-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">error</span>
                          <span>{fieldErrors.district}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* FIELD 4b: Block / Tehsil (Optional) */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="block" className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                      <span className="material-symbols-outlined text-primary text-[20px]">holiday_village</span>
                      <span>
                        Block / Tehsil{' '}
                        <span className="text-secondary font-semibold">
                          (Optional)
                        </span>
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        id="block"
                        type="text"
                        maxLength={100}
                        value={localData.block || ''}
                        onChange={(e) => handleFieldChange('block', e.target.value)}
                        aria-describedby={fieldErrors.block ? 'block-error' : undefined}
                        aria-invalid={!!fieldErrors.block}
                        placeholder="e.g. Pindra, Karchhana, Mohali"
                        className={`w-full h-[52px] px-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary border ${
                          fieldErrors.block ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                        }`}
                      />
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
                        domain
                      </span>
                    </div>
                    {fieldErrors.block && (
                      <p id="block-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">error</span>
                        <span>{fieldErrors.block}</span>
                      </p>
                    )}
                  </div>

                  {/* FIELD 5 & 6: Irrigation Source & Land Area */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Irrigation Source */}
                    <div className="flex flex-col gap-2">
                      <label htmlFor="water-source" className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-primary text-[20px]">water_drop</span>
                        <span>
                          Water Source{' '}
                          <span className="text-secondary font-semibold">
                            (Irrigation Source)
                          </span>
                        </span>
                      </label>
                      <div className="relative">
                        <select
                          id="water-source"
                          value={localData.waterSource}
                          onChange={(e) => handleFieldChange('waterSource', e.target.value)}
                          aria-describedby={fieldErrors.waterSource ? 'water-source-error' : undefined}
                          aria-invalid={!!fieldErrors.waterSource}
                          className={`w-full h-[52px] px-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md appearance-none focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary pr-10 border cursor-pointer ${
                            fieldErrors.waterSource ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                          }`}
                        >
                          {options?.waterSources.map((ws) => (
                            <option key={ws.id} value={ws.id}>
                              {ws.nameEn}
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                          expand_more
                        </span>
                      </div>
                      {fieldErrors.waterSource && (
                        <p id="water-source-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">error</span>
                          <span>{fieldErrors.waterSource}</span>
                        </p>
                      )}
                    </div>

                    {/* Composite Land Size */}
                    <div className="flex flex-col gap-2">
                      <label htmlFor="land-size" className="font-label-lg text-label-lg text-on-surface flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-primary text-[20px]">square_foot</span>
                        <span>
                          Total Cultivated Land{' '}
                          <span className="text-secondary font-semibold">
                            (Land Size)
                          </span>
                        </span>
                        <span className="text-error font-bold">*</span>
                      </label>
                      <div
                        className={`flex rounded-xl overflow-hidden bg-surface-container-low border focus-within:ring-2 focus-within:ring-primary ${
                          fieldErrors.landSize ? 'border-error ring-1 ring-error' : 'border-outline-variant/30'
                        }`}
                      >
                        <input
                          id="land-size"
                          type="number"
                          min="0.01"
                          max="10000"
                          step="0.1"
                          value={localData.landSize}
                          onChange={(e) => handleFieldChange('landSize', parseFloat(e.target.value) || 0)}
                          aria-describedby={fieldErrors.landSize ? 'land-size-error' : undefined}
                          aria-invalid={!!fieldErrors.landSize}
                          className="w-1/2 h-[52px] px-4 bg-transparent text-on-surface font-headline-sm text-headline-sm focus:outline-none font-bold"
                        />
                        <select
                          id="land-unit"
                          value={localData.landUnit}
                          onChange={(e) => handleFieldChange('landUnit', e.target.value)}
                          className="w-1/2 h-[52px] px-3 bg-surface-container font-label-md text-label-md text-on-surface border-0 focus:outline-none cursor-pointer border-l border-outline-variant/30"
                        >
                          {options?.units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nameEn}
                            </option>
                          ))}
                        </select>
                      </div>
                      {fieldErrors.landSize && (
                        <p id="land-size-error" role="alert" className="font-label-sm text-label-sm text-error mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">error</span>
                          <span>{fieldErrors.landSize}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Calculation Preview Box */}
                  <div className="p-4 rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-outline-variant/20">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary text-[24px]">calculate</span>
                      <div>
                        <p className="font-label-md text-label-md text-on-surface font-bold">
                          Normalized Plot Sizing:{' '}
                          <span className="text-secondary">{getNormalizedArea()}</span>
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          Calculates seed pack requirement and fertigation batch volume dynamically.
                        </p>
                      </div>
                    </div>
                    <span className="text-[12px] text-on-surface-variant italic">
                      *Bigha size varies by state; 1 bigha ≈ 0.4 acre used as Pan-India approximation.
                    </span>
                  </div>

                  {/* Action CTA Group */}
                  <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
                    <button
                      type="submit"
                      disabled={isLoading || isOptionsLoading}
                      className="w-full sm:flex-1 h-14 bg-primary text-on-primary rounded-xl font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 hover:bg-tertiary shadow-md active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <span className="w-5 h-5 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></span>
                          <span>Generating your advice...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[24px]">psychiatry</span>
                          <span>Get Crop Advice Now</span>
                          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isLoading}
                      className="w-full sm:w-auto h-14 px-6 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 transition-colors border border-outline-variant/30 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[20px]">restart_alt</span>
                      <span>Reset Form</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Fast Advisory Highlights Card */}
            <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col sm:flex-row items-center gap-5 border border-outline-variant/30">
              <img
                alt="Close up shot of healthy agricultural crops"
                className="w-24 h-24 rounded-xl object-cover shrink-0 shadow-sm"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCEuve6HiG5HSdrg96AsKhiwBmuoFTTQUv8eD7FHiJXTEFWr1IVENB-nD8z0b5bCwRT_RgTplL3z_5Q0zzpAO2gb22fz7cgMQQ2jbACklqsYkzBybC_0Ph5cxmI3ovqK2nyvyOB40-X4ThCFVt_SaZpHuavflYtqaVPlpOXA0uDwXiNUDSW1Dww423twhsR1vzBOgM4f9bKbz_emhxIHoFg6-pqkpTizlDM2OgnD0kgtUpN4-14bCu1"
                referrerPolicy="no-referrer"
              />
              <div className="space-y-1 text-center sm:text-left">
                <div className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary font-bold">
                  <span className="material-symbols-outlined text-[16px]">bolt</span>
                  <span>INSTANT AGRO-AI GENERATION</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Advisory includes Season Crop Calendar
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Includes spray timing for major pests, micro-nutrient ZnSO4/Boron schedule, and APMC benchmark mandi price trends.
                </p>
              </div>
            </div>
          </section>

          {/* RIGHT COLUMN: Helpful Advisory Side Cards */}
          <aside className="lg:col-span-4 flex flex-col gap-6">
            {/* Pro Tip: Sowing Window */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm space-y-3 border border-outline-variant/30">
              <div className="w-10 h-10 rounded-full bg-secondary-container/20 text-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">lightbulb</span>
              </div>
              <div>
                <span className="font-label-sm text-label-sm font-bold text-secondary uppercase tracking-wider">
                  Pro Tip
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Choosing the Right Sowing Window
                </h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Across India, synchronizing sowing with the regional monsoon arrival ensures optimum seed germination. Timely sowing protects young seedlings against early pest attacks and heat stress during maturity.
              </p>
              <div className="p-3 bg-surface-container rounded-xl flex items-start gap-2 text-on-surface border border-outline-variant/20">
                <span className="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">warning</span>
                <p className="font-label-sm text-label-sm">
                  Always verify soil moisture before sowing to ensure deep and uniform root establishment.
                </p>
              </div>
            </div>

            {/* Soil Testing Card */}
            <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-sm space-y-4 border border-outline-variant/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-container text-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px]">science</span>
                </div>
                <div>
                  <span className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider">
                    Soil Precision
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface leading-tight font-bold">
                    Soil Health Card Insight
                  </h3>
                </div>
              </div>
              <img
                alt="Farmer examining soil health card"
                className="w-full h-36 rounded-xl object-cover shadow-sm"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuApp2MibK1eqRekK4aOnCkl8CuNaWTAMNqaC-z5L_MoWivC6eGqfbVHkgV1nnavbMYT-1NPOZCC21Y4k18LxToXA0yFMQt3me_ih2GgjHKkrvDf8VFQVgvjz_mujKIwanug9RCsngHnRPPkSWKILurvLMbcNKabej2GxwO2iSoClWERoqi-YDAx9muPh-ojYae6oi_RvTyUSMwGs5XAVuDpDyvqHF-DkN7IzYLQY9yNKkifnOEaR_ps"
                referrerPolicy="no-referrer"
              />
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Got your <strong className="text-on-surface font-semibold">National Soil Health Card</strong> handy? Entering your soil organic carbon and electrical conductivity (EC) unlocks up to 20% lower chemical expenditure.
              </p>
              <button
                type="button"
                onClick={() => alert('Soil Health Card Portal Integration: Enter your 12-digit Soil Health Card number (e.g. IN-2024-8841) to automatically sync organic carbon and pH values.')}
                className="inline-flex items-center gap-1.5 font-label-md text-label-md text-primary font-bold hover:text-tertiary transition-colors"
              >
                <span>Link my Soil Card Number</span>
                <span className="material-symbols-outlined text-[18px]">arrow_right_alt</span>
              </button>
            </div>

            {/* Toll-free Assistance Card */}
            <div className="bg-primary-container text-on-primary p-6 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-container-lowest/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[22px] text-on-primary">call</span>
                </div>
                <div>
                  <span className="font-label-sm text-label-sm text-on-primary-container uppercase font-bold tracking-wider">
                    Direct Agri Call Center
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-primary font-bold">
                    Need Phone Assistance?
                  </h3>
                </div>
              </div>
              <p className="font-body-sm text-body-sm text-on-primary/90 leading-relaxed">
                Speak to a certified agronomist at Kisan Call Centre. Call toll-free between 6:00 AM – 10:00 PM in English.
              </p>
              <a
                href="tel:18001801551"
                className="bg-surface-container-lowest/15 p-3.5 rounded-xl flex items-center justify-between hover:bg-surface-container-lowest/25 transition-colors"
              >
                <span className="font-display-lg text-display-lg-mobile tracking-wider font-mono font-bold text-on-primary">
                  1800-180-1551
                </span>
                <span className="material-symbols-outlined text-secondary-fixed text-[24px]">phone_in_talk</span>
              </a>
              <p className="font-label-sm text-label-sm text-on-primary-container text-center">
                Toll-Free Agricultural Advisory Helpline
              </p>
            </div>

            {/* University Trust Endorsement */}
            <div className="bg-surface-container-low p-5 rounded-2xl space-y-3 border border-outline-variant/30">
              <div className="flex items-center gap-2 text-on-surface">
                <span className="material-symbols-outlined text-primary text-[20px]">military_tech</span>
                <h4 className="font-label-md text-label-md font-bold">Scientific Endorsements</h4>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Dosage and IPM pest protocols calibrated according to ICAR and leading State Agricultural Universities:
              </p>
              <ul className="font-label-sm text-label-sm text-on-surface space-y-1.5 pl-1">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[16px]">check_circle</span>
                  <span>ICAR - Indian Agricultural Research Institute (IARI)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[16px]">check_circle</span>
                  <span>Punjab Agricultural University (PAU)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[16px]">check_circle</span>
                  <span>G. B. Pant University of Agriculture &amp; Technology</span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
