import React, { useState, useEffect } from 'react';
import { PageId, CropInfo, CropSummary } from '../types';
import { getCrops } from '../api/client';
import { speakText, stopSpeaking } from '../utils/speechUtils';

interface HomePageProps {
  onNavigate: (page: PageId) => void;
  onSetQuickAdvisory: (crop: string, district: string, soil: string) => void;
  onOpenVoiceModal: () => void;
  onSelectCropForGuide: (crop: CropSummary | CropInfo) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onSetQuickAdvisory,
  onOpenVoiceModal,
  onSelectCropForGuide,
}) => {
  // Quick Diagnosis form state
  const [district, setDistrict] = useState('Varanasi');
  const [crop, setCrop] = useState('wheat');
  const [soil, setSoil] = useState('loamy');
  const [showQuickResult, setShowQuickResult] = useState(false);
  const [cropFilter, setCropFilter] = useState<'all' | 'kharif' | 'rabi'>('all');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isTickerPlaying, setIsTickerPlaying] = useState(false);

  const quickAdviceMap: Record<string, { title: string; desc: string }> = {
    wheat: {
      title: 'Wheat Advisory – Indo-Gangetic Plains & Central India',
      desc: 'Crown root initiation stage (21 days after sowing) is most sensitive. Apply first dose of Urea before first irrigation.',
    },
    rice: {
      title: 'Rice / Paddy Advisory – Alluvial & Delta Belts',
      desc: 'Tillering stage: Maintain 2–3 cm shallow standing water. Apply split dose of nitrogen with zinc booster.',
    },
    cotton: {
      title: 'Cotton Advisory – Central & Western Plains',
      desc: 'Vegetative & Flowering stage: Ensure balanced 12:32:16 basal nutrition. Watch for sucking pests (Jassids/Thrips). Irrigate every 7-9 days.',
    },
    groundnut: {
      title: 'Groundnut Advisory – Rainfed & Irrigated Belts',
      desc: 'Pod pegging phase: Apply Gypsum around roots. Maintain light irrigation to soften soil crust for seamless peg penetration.',
    },
    mustard: {
      title: 'Mustard Advisory – Northern Plains',
      desc: 'Flowering stage: Protect against aphid infestation using neem spray. Provide light irrigation at 30 and 55 DAS.',
    },
    maize: {
      title: 'Maize Advisory – Pan-India',
      desc: 'Knee-high and tasseling stages are critical for moisture. Side-dress Urea to maximize cob size and grain weight.',
    },
    cumin: {
      title: 'Cumin Advisory – Semi-Arid Plains',
      desc: 'Cloudy weather warning: Spray Mancozeb 75% WP (25g/10L water) preventatively against blight immediately.',
    },
    bajra: {
      title: 'Bajra Advisory – Drought-Prone Belts',
      desc: 'Tillering stage: Thinning recommended if population is dense. Apply Urea post light rain or irrigation.',
    },
    castor: {
      title: 'Castor Advisory – Light & Loam Soils',
      desc: 'Primary spike formation: Nip secondary lateral shoots to divert nutrition into primary central spikes for 20% higher bean yield.',
    },
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowQuickResult(true);
  };

  const handleGoToFullReport = () => {
    onSetQuickAdvisory(crop, district, soil);
    onNavigate('results');
  };

  const handlePlayHeroIntro = () => {
    if (isAudioPlaying) {
      stopSpeaking();
      setIsAudioPlaying(false);
    } else {
      const text =
        'Welcome to KisanSathi. Scientific crop advisory, fertilizer management, and irrigation schedules for Indian farmers are available here.';
      speakText(
        text,
        'en-IN',
        () => setIsAudioPlaying(true),
        () => setIsAudioPlaying(false)
      );
    }
  };

  const handlePlayTicker = () => {
    if (isTickerPlaying) {
      stopSpeaking();
      setIsTickerPlaying(false);
    } else {
      const text =
        "Today's major market prices: Wheat 2,420 to 2,650 rupees, Cotton 7,250 to 7,850 rupees per quintal recorded.";
      speakText(
        text,
        'en-IN',
        () => setIsTickerPlaying(true),
        () => setIsTickerPlaying(false)
      );
    }
  };

  // Major crops state loaded from API
  const [crops, setCrops] = useState<CropSummary[]>([]);
  const [isLoadingCrops, setIsLoadingCrops] = useState<boolean>(true);
  const [cropsError, setCropsError] = useState<string | null>(null);

  const fetchCrops = () => {
    setIsLoadingCrops(true);
    setCropsError(null);
    getCrops()
      .then((res) => {
        setCrops(res.crops || []);
        setIsLoadingCrops(false);
      })
      .catch((err: unknown) => {
        setIsLoadingCrops(false);
        const msg = err instanceof Error ? err.message : 'Failed to load crops';
        setCropsError(msg);
      });
  };

  useEffect(() => {
    let mounted = true;
    setIsLoadingCrops(true);
    setCropsError(null);

    getCrops()
      .then((res) => {
        if (mounted) {
          setCrops(res.crops || []);
          setIsLoadingCrops(false);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setIsLoadingCrops(false);
          const msg = err instanceof Error ? err.message : 'Failed to load crops';
          setCropsError(msg);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Filter crops for major crops section
  const filteredCrops = crops.slice(0, 6).filter((c) => {
    if (cropFilter === 'all') return true;
    return c.category && c.category.includes(cropFilter);
  });

  return (
    <div className="flex flex-col w-full">
      {/* 1. Top Live National Mandi & Weather Ticker Strip */}
      <section className="w-full bg-surface-container py-2.5 px-4 sm:px-6 lg:px-8 border-b border-outline-variant/20 transition-colors duration-200">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-3 text-on-surface-variant font-label-sm text-label-sm">
          <div className="flex items-center flex-wrap gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary font-semibold text-[11px] uppercase tracking-wider shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed animate-ping"></span>
              Live Mandi
            </span>
            <span className="font-medium text-on-surface">National APMC: Wheat ₹2,420 - ₹2,650 / Qtl</span>
            <span className="hidden md:inline text-outline-variant">•</span>
            <span className="hidden md:inline font-medium text-on-surface">Cotton ₹7,250 - ₹7,850 / Qtl</span>
          </div>
          <div className="flex items-center gap-4 text-on-surface ml-auto">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[17px] text-secondary">wb_sunny</span>
              <span>Agro Climate 29°C | Humidity: 54%</span>
            </div>
            <button
              onClick={handlePlayTicker}
              className="flex items-center gap-1 text-primary hover:text-tertiary transition-colors font-semibold select-none"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isTickerPlaying ? 'volume_off' : 'volume_up'}
              </span>
              <span>{isTickerPlaying ? 'Stop' : 'Listen'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Hero Section */}
      <section className="relative w-full pt-8 pb-16 lg:pt-12 lg:pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Ambient organic green backdrop accent */}
        <div className="absolute -top-24 right-0 w-[520px] h-[520px] rounded-full bg-primary-fixed/20 blur-3xl -z-10 pointer-events-none"></div>
        <div className="absolute top-1/2 left-[-120px] w-[380px] h-[380px] rounded-full bg-secondary-fixed/20 blur-3xl -z-10 pointer-events-none"></div>

        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Hero Text & Action Block */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Pan-India Advisory Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high w-fit shadow-sm border border-outline-variant/30">
                <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                <span className="font-label-sm text-label-sm text-on-surface font-semibold tracking-wide">
                  Certified Smart Crop Advisory for Indian Farmers
                </span>
              </div>

              {/* Main Hero Headlines */}
              <div className="flex flex-col gap-3">
                <h1 className="font-display-lg text-display-lg text-on-surface font-bold tracking-tight">
                  Smart farming advice, <br className="hidden sm:inline" />
                  <span className="text-primary">right when you need it</span>
                </h1>
                <p className="font-headline-sm text-headline-sm text-secondary font-semibold">
                  Accurate fertilizer, irrigation, and crop protection advice for your land
                </p>
                <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl leading-relaxed mt-1">
                  Tailored agro-climatic recommendations for farmers across all Indian states and zones. Input your crop, soil type, and location to receive instant fertilizer schedules, pest management, and watering plans.
                </p>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
                <button
                  onClick={() => onNavigate('get-advice')}
                  className="inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-full bg-primary-container hover:bg-primary text-on-primary font-label-lg text-label-lg shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98] font-bold"
                  type="button"
                >
                  <span>Get Free Advice Now</span>
                  <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                </button>

                <button
                  onClick={() => onNavigate('crop-library')}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-full bg-surface-container-lowest hover:bg-surface-container text-primary font-label-lg text-label-lg shadow-sm border border-outline-variant/40 transition-all duration-200 font-semibold"
                  type="button"
                >
                  <span className="material-symbols-outlined text-primary text-[20px]">eco</span>
                  <span>Explore Crop Library</span>
                </button>

                <button
                  onClick={handlePlayHeroIntro}
                  className="inline-flex items-center justify-center gap-2 px-4 py-4 rounded-full bg-secondary-container/20 hover:bg-secondary-container/30 text-on-secondary-container font-label-md text-label-md transition-colors font-semibold"
                  title="English Audio Guide"
                  type="button"
                >
                  <span className="material-symbols-outlined text-secondary text-[22px]">
                    {isAudioPlaying ? 'pause_circle' : 'campaign'}
                  </span>
                  <span>{isAudioPlaying ? 'Stop Audio' : 'Audio Guide'}</span>
                </button>
              </div>

              {/* Live Impact Banner Statistics */}
              <div className="grid grid-cols-3 gap-3 pt-6 mt-2">
                <div className="flex flex-col p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/30">
                  <span className="font-display-lg text-display-lg text-primary font-bold">28+</span>
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold">States &amp; UTs</span>
                  <span className="font-label-sm text-[11px] text-on-surface-variant">All-India Coverage</span>
                </div>
                <div className="flex flex-col p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/30">
                  <span className="font-display-lg text-display-lg text-secondary font-bold">18+</span>
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold">Indian Crops</span>
                  <span className="font-label-sm text-[11px] text-on-surface-variant">Wheat, Paddy, Cotton, Maize</span>
                </div>
                <div className="flex flex-col p-4 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/30">
                  <span className="font-display-lg text-display-lg text-primary-container font-bold">92%</span>
                  <span className="font-label-sm text-label-sm text-on-surface font-semibold">Yield Increase</span>
                  <span className="font-label-sm text-[11px] text-on-surface-variant">Farmer-Reported Yield Increase</span>
                </div>
              </div>
            </div>

            {/* Rich Visual Hero Farm Telemetry Card */}
            <div className="lg:col-span-5 relative">
              <div className="relative bg-surface-container-lowest rounded-2xl p-4 shadow-xl border border-outline-variant/30">
                {/* Farm Field Image */}
                <div className="relative w-full h-64 sm:h-72 rounded-xl overflow-hidden">
                  <img
                    alt="Lush green crop field with healthy crops"
                    className="w-full h-full object-cover"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBibMjK-EMFoZ5MA_HcE4y_wa-eD3MgLG35U9caqqmjhHHLtBWxNROa5wOckbLohCnHSQrhqb77Lpi0TfVAufOlHlbxgvhAm-UAkOCl7ZJKU873gSAI-6OB2ZywjF9Zhpx1UGyRiWD4DDLRiGi-_gCZ2EpBr5CmBguyEq2AGpsa9nzFT6Y5QBDSuK2iv5T_oM4zDXxPu5KufJiBFz5LGGBS2NYxIP4jzwkWAs_3GctknC_mUB6PMLnI"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/85 via-inverse-surface/25 to-transparent"></div>

                  {/* Floating Pill Badges on image */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-primary font-label-sm text-label-sm shadow-sm font-semibold">
                      <span className="material-symbols-outlined text-[15px] text-primary">eco</span>
                      National Agro-Advisory
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-fixed font-label-sm text-label-sm font-bold shadow-sm">
                      Kharif &amp; Rabi
                    </span>
                  </div>

                  {/* Overlaid Current Field Condition Snapshot */}
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white">
                    <div>
                      <div className="font-headline-sm text-headline-sm font-bold leading-tight">
                        Wheat &amp; Mustard Plot
                      </div>
                      <div className="font-label-sm text-label-sm opacity-90">
                        Model Farm
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-lowest/20 backdrop-blur-md">
                      <span className="material-symbols-outlined text-secondary-fixed text-[18px]">verified_user</span>
                      <span className="font-label-sm text-[12px] font-semibold text-white">Optimal Stage</span>
                    </div>
                  </div>
                </div>

                {/* Telemetry Badges & Sensor Readings below photo */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {/* Soil Moisture */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-primary text-xl">water_drop</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">Moisture</span>
                      <div className="flex items-baseline gap-1">
                        <span className="font-headline-sm text-headline-sm text-primary font-bold">78%</span>
                        <span className="font-label-sm text-[11px] text-tertiary font-medium">Optimal</span>
                      </div>
                    </div>
                  </div>

                  {/* N-P-K Nutrient Status */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                    <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-secondary text-xl">science</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">N-P-K Ratio</span>
                      <div className="flex items-baseline gap-1">
                        <span className="font-headline-sm text-headline-sm text-on-surface font-bold">Balanced</span>
                        <span className="font-label-sm text-[11px] text-primary font-semibold">12:32:16</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Integrated Micro Weather Widget */}
                <div className="mt-3 p-3.5 rounded-xl bg-surface-container flex items-center justify-between border border-outline-variant/20">
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-secondary text-2xl">sunny</span>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface">National Agromet Station</span>
                      <span className="font-body-sm text-[12px] text-on-surface-variant">Wind: 12 km/h • Fair Weather</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-headline-md text-headline-md font-bold text-on-surface">29°C</span>
                    <span className="block font-label-sm text-[11px] text-on-surface-variant">Sunny</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* 3. Interactive Quick Advisory Simulator Mini-Bar */}
      <section className="w-full px-4 sm:px-6 lg:px-8 -mt-4 mb-12">
        <div className="max-w-[1200px] mx-auto bg-surface-container-lowest p-5 sm:p-6 rounded-2xl shadow-md border border-outline-variant/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4 border-b border-outline-variant/20">
            <div>
              <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                Quick Crop Diagnosis
              </span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                Find Tailored Advice for Your Land
              </h2>
            </div>
            <div className="flex items-center gap-2 text-on-surface-variant font-label-sm text-label-sm">
              <span className="material-symbols-outlined text-primary text-[18px]">touch_app</span>
              <span>1-Click Simple Selection</span>
            </div>
          </div>

          <form onSubmit={handleQuickSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Location Select */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1" htmlFor="quickDistrict">
                <span className="material-symbols-outlined text-[16px] text-primary">location_on</span>
                Location (State / District)
              </label>
              <select
                id="quickDistrict"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="h-[50px] px-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all cursor-pointer border border-outline-variant/30"
              >
                <option value="Varanasi">Varanasi, Uttar Pradesh</option>
                <option value="Ludhiana">Ludhiana, Punjab</option>
                <option value="Karnal">Karnal, Haryana</option>
                <option value="Indore">Indore, Madhya Pradesh</option>
                <option value="Nagpur">Nagpur, Maharashtra</option>
                <option value="Jaipur">Jaipur, Rajasthan</option>
                <option value="Patna">Patna, Bihar</option>
                <option value="Guntur">Guntur, Andhra Pradesh</option>
                <option value="Burdwan">Burdwan, West Bengal</option>
              </select>
            </div>

            {/* Crop Select */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1" htmlFor="quickCrop">
                <span className="material-symbols-outlined text-[16px] text-primary">psychiatry</span>
                Main Crop
              </label>
              <select
                id="quickCrop"
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                className="h-[50px] px-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all cursor-pointer border border-outline-variant/30"
              >
                <option value="wheat">Wheat</option>
                <option value="rice">Rice / Paddy</option>
                <option value="cotton">Cotton</option>
                <option value="groundnut">Groundnut</option>
                <option value="mustard">Mustard</option>
                <option value="maize">Maize</option>
                <option value="soybean">Soybean</option>
                <option value="sugarcane">Sugarcane</option>
                <option value="chickpea">Chickpea</option>
                <option value="cumin">Cumin</option>
                <option value="bajra">Bajra</option>
              </select>
            </div>

            {/* Soil Type Select */}
            <div className="flex flex-col gap-1.5">
              <label className="font-label-sm text-label-sm text-on-surface font-semibold flex items-center gap-1" htmlFor="quickSoil">
                <span className="material-symbols-outlined text-[16px] text-primary">landscape</span>
                Soil Type
              </label>
              <select
                id="quickSoil"
                value={soil}
                onChange={(e) => setSoil(e.target.value)}
                className="h-[50px] px-3.5 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none transition-all cursor-pointer border border-outline-variant/30"
              >
                <option value="alluvial">Alluvial Soil</option>
                <option value="black">Black Regur Soil</option>
                <option value="red">Red Soil</option>
                <option value="laterite">Laterite Soil</option>
                <option value="sandy">Sandy / Desert Soil</option>
                <option value="loamy">Loamy Soil</option>
                <option value="clay">Clay Soil</option>
                <option value="mountain">Mountain / Forest Soil</option>
              </select>
            </div>

            {/* Submit Button */}
            <div className="flex flex-col justify-end">
              <button
                type="submit"
                className="h-[50px] w-full px-4 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 shadow-sm transition-all duration-200 font-bold"
              >
                <span className="material-symbols-outlined text-[20px]">search</span>
                <span>Get Advice</span>
              </button>
            </div>
          </form>

          {/* Instant Output Preview Toast */}
          {showQuickResult && (
            <div className="mt-4 p-4 rounded-xl bg-surface-container-high border border-outline-variant/30 transition-all animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-2xl mt-0.5">tips_and_updates</span>
                  <div>
                    <h4 className="font-headline-sm text-headline-sm text-primary font-bold">
                      {quickAdviceMap[crop]?.title || 'Agro-Advisory Ready'}
                    </h4>
                    <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                      {quickAdviceMap[crop]?.desc}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleGoToFullReport}
                  className="shrink-0 px-5 py-2.5 rounded-lg bg-primary-container text-on-primary font-label-sm text-label-sm hover:bg-primary transition-colors font-bold shadow-sm"
                  type="button"
                >
                  View Complete Report →
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. "How It Works" Section */}
      <section className="w-full py-16 px-4 sm:px-6 lg:px-8 bg-surface-container-low transition-colors duration-200">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-12">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto flex flex-col gap-3">
            <span className="font-label-md text-label-md text-secondary font-bold uppercase tracking-wider">
              Fast &amp; Accessible Guidance
            </span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
              Simple 3-Step Guidance For Better Harvest
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              No complex forms. Simple choices designed for easy touch in bright sunlight.
            </p>
          </div>

          {/* 3 Step Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            {/* Step 1 */}
            <div className="flex flex-col p-6 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group border border-outline-variant/30">
              <div className="flex items-center justify-between mb-6">
                <span className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary transition-colors">
                  <span className="material-symbols-outlined text-2xl">pin_drop</span>
                </span>
                <span className="font-display-lg text-display-lg text-surface-container-highest font-extrabold select-none">
                  01
                </span>
              </div>
              <span className="inline-flex px-3 py-1 rounded-full bg-primary-fixed/40 text-on-primary-fixed-variant font-label-sm text-label-sm font-semibold w-fit mb-2">
                STEP 01
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-2">
                Enter Your Crop &amp; Land Details
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Select your crop, soil texture, state, district, and current season in under 30 seconds. Works seamlessly for all agro-climatic zones across India.
              </p>
              <div className="mt-6 pt-4 flex items-center gap-2 text-primary font-label-sm text-label-sm font-semibold border-t border-outline-variant/20">
                <span className="material-symbols-outlined text-[16px]">touch_app</span>
                <span>Simple icon-based inputs</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col p-6 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group border border-outline-variant/30">
              <div className="flex items-center justify-between mb-6">
                <span className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center group-hover:bg-secondary group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-2xl">psychiatry</span>
                </span>
                <span className="font-display-lg text-display-lg text-surface-container-highest font-extrabold select-none">
                  02
                </span>
              </div>
              <span className="inline-flex px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-label-sm font-semibold w-fit mb-2">
                STEP 02
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-2">
                Instant Smart Advisory
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Our agro-algorithmic engine analyzes validated ICAR and state university agronomy datasets against your local agro-climate and season.
              </p>
              <div className="mt-6 pt-4 flex items-center gap-2 text-secondary font-label-sm text-label-sm font-semibold border-t border-outline-variant/20">
                <span className="material-symbols-outlined text-[16px]">bolt</span>
                <span>Micro-climate calculation</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col p-6 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group border border-outline-variant/30">
              <div className="flex items-center justify-between mb-6">
                <span className="w-12 h-12 rounded-xl bg-tertiary-container/10 text-tertiary-container flex items-center justify-center group-hover:bg-tertiary-container group-hover:text-on-tertiary transition-colors">
                  <span className="material-symbols-outlined text-2xl">currency_rupee</span>
                </span>
                <span className="font-display-lg text-display-lg text-surface-container-highest font-extrabold select-none">
                  03
                </span>
              </div>
              <span className="inline-flex px-3 py-1 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-label-sm font-semibold w-fit mb-2">
                STEP 03
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-2">
                Grow Healthier, Earn More
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Follow precise NPK dosage, irrigation intervals, and preventive pest sprays. Farmers report saving up to ₹2,500/acre on unnecessary chemical sprays.
              </p>
              <div className="mt-6 pt-4 flex items-center gap-2 text-tertiary font-label-sm text-label-sm font-semibold border-t border-outline-variant/20">
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                <span>Higher yield &amp; lower cost</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 4 Essential Pillars Section */}
      <section className="w-full py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex flex-col gap-2 max-w-xl">
              <span className="font-label-md text-label-md text-secondary font-bold uppercase tracking-wider">
                Comprehensive Guidance • 4 Essential Pillars
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                Comprehensive Agro-Science For Every Acre
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Everything your field needs from seed preparation to the final mandi sale.
              </p>
            </div>
            <button
              onClick={() => onNavigate('get-advice')}
              className="inline-flex items-center gap-2 text-primary hover:text-tertiary font-label-md text-label-md font-semibold select-none"
              type="button"
            >
              <span>Start Full Diagnosis</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Fertilizer Guidance */}
            <div className="p-7 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between border border-outline-variant/30">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">inventory_2</span>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-primary-fixed/50 text-on-primary-fixed font-label-sm text-label-sm font-semibold">
                    Fertilizer Management (NPK)
                  </span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold mb-2">
                  Scientific Fertilizer Dosage
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-4">
                  Stop over-applying chemical fertilizers. Get exact basal dose timelines, top dressing splits, Urea/DAP/MOP ratios tailored for your field size, plus organic Jeevamrut &amp; Panchagavya alternatives.
                </p>
                <div className="p-3.5 rounded-xl bg-surface-container-low flex flex-col gap-2 border border-outline-variant/20">
                  <div className="flex items-center justify-between text-on-surface font-label-sm text-label-sm">
                    <span>DAP Reduction Average:</span>
                    <span className="font-bold text-primary">-25% to -30% input cost</span>
                  </div>
                  <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: '72%' }}></div>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 flex items-center justify-between border-t border-outline-variant/20">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Covers: Chemical &amp; Organic</span>
                <button
                  onClick={() => onNavigate('get-advice')}
                  className="inline-flex items-center gap-1 font-label-sm text-label-sm text-primary font-semibold hover:underline"
                >
                  <span>View Fertilizer Plan</span>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Card 2: Irrigation Schedule */}
            <div className="p-7 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between border border-outline-variant/30">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-tertiary-container text-on-tertiary flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">water_drop</span>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-surface-container-high text-tertiary font-label-sm text-label-sm font-semibold">
                    Irrigation Schedule
                  </span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold mb-2">
                  Critical Growth Stage Irrigation
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-4">
                  Prevent water stress during crucial stages: flowering, boll formation, and pod filling. Optimize borewell and drip irrigation schedules according to local humidity and evapotranspiration.
                </p>
                <div className="p-3.5 rounded-xl bg-surface-container-low flex items-center justify-between text-center border border-outline-variant/20">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-bold text-tertiary">Germination</span>
                    <span className="font-label-sm text-[11px] text-on-surface-variant">Day 1-12</span>
                  </div>
                  <span className="material-symbols-outlined text-outline-variant text-sm">arrow_forward</span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-bold text-tertiary">Flowering</span>
                    <span className="font-label-sm text-[11px] text-secondary font-semibold">Crucial Stage</span>
                  </div>
                  <span className="material-symbols-outlined text-outline-variant text-sm">arrow_forward</span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-bold text-tertiary">Pod Filling</span>
                    <span className="font-label-sm text-[11px] text-on-surface-variant">Yield Booster</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 flex items-center justify-between border-t border-outline-variant/20">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Drip &amp; Flood Presets</span>
                <button
                  onClick={() => onNavigate('get-advice')}
                  className="inline-flex items-center gap-1 font-label-sm text-label-sm text-tertiary font-semibold hover:underline"
                >
                  <span>View Irrigation Schedule</span>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Card 3: Disease & Pest Alerts */}
            <div className="p-7 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between border border-outline-variant/30">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-error-container text-on-error-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">pest_control</span>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-error-container/60 text-error font-label-sm text-label-sm font-semibold">
                    Pest &amp; Disease Control
                  </span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold mb-2">
                  Disease &amp; Pest Early Warning
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-4">
                  Proactive alerts for Pink Bollworm in Cotton, Tikka disease &amp; Stem Rot in Groundnut, and Blight in Cumin. Includes low-cost organic Neem oil regimens and precise chemical sprays.
                </p>
                <div className="p-3.5 rounded-xl bg-error-container/30 flex items-center gap-3 border border-error/20">
                  <span className="material-symbols-outlined text-error text-xl shrink-0">warning</span>
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm font-bold text-on-error-container">
                      Pink Bollworm Alert (Cotton Belt)
                    </span>
                    <span className="font-body-sm text-[12px] text-on-surface-variant">
                      Install 5 Pheromone Traps / Acre immediately
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-6 pt-4 flex items-center justify-between border-t border-outline-variant/20">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Visual Diagnosis AI Ready</span>
                <button
                  onClick={() => onNavigate('get-advice')}
                  className="inline-flex items-center gap-1 font-label-sm text-label-sm text-error font-semibold hover:underline"
                >
                  <span>Check Symptoms</span>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Card 4: Seasonal Agricultural Tips */}
            <div className="p-7 rounded-2xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between border border-outline-variant/30">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-fixed flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">calendar_month</span>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-semibold">
                    Seasonal Crop Calendar
                  </span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold mb-2">
                  Seasonal Indian Agro Calendar
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-4">
                  Timely sowing windows for Kharif, Rabi, and Summer / Zaid cycles. Biological seed treatments using Trichoderma viride and Rhizobium bio-fertilizers to prevent seedling mortality.
                </p>
                <div className="p-3.5 rounded-xl bg-surface-container-low flex items-center justify-between text-on-surface border border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-lg">spa</span>
                    <span className="font-label-sm text-label-sm font-semibold">Seed Treatment Ratio</span>
                  </div>
                  <span className="font-label-sm text-label-sm font-bold text-secondary">5g Trichoderma / kg seed</span>
                </div>
              </div>
              <div className="mt-6 pt-4 flex items-center justify-between border-t border-outline-variant/20">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Updated Weekly</span>
                <button
                  onClick={() => onNavigate('crop-library')}
                  className="inline-flex items-center gap-1 font-label-sm text-label-sm text-secondary font-semibold hover:underline"
                >
                  <span>Seasonal Crop Guides</span>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Major Crops Row */}
      <section className="w-full py-16 px-4 sm:px-6 lg:px-8 bg-surface-container-low transition-colors duration-200">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="font-label-md text-label-md text-primary font-bold uppercase tracking-wider">
                Major Cropping Systems of India
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                Major Crops Cultivated in India
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Tap on any crop to explore state and district yield blueprints, best sowing windows, and market prices.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCropFilter('all')}
                className={`px-4 py-1.5 rounded-full font-label-sm text-label-sm font-semibold transition-colors ${
                  cropFilter === 'all'
                    ? 'bg-primary-container text-on-primary'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
                type="button"
              >
                All Crops
              </button>
              <button
                onClick={() => setCropFilter('kharif')}
                className={`px-4 py-1.5 rounded-full font-label-sm text-label-sm font-medium transition-colors ${
                  cropFilter === 'kharif'
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
                type="button"
              >
                Kharif
              </button>
              <button
                onClick={() => setCropFilter('rabi')}
                className={`px-4 py-1.5 rounded-full font-label-sm text-label-sm font-medium transition-colors ${
                  cropFilter === 'rabi'
                    ? 'bg-primary-container text-on-primary font-semibold'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
                type="button"
              >
                Rabi
              </button>
            </div>
          </div>

          {/* Crops Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoadingCrops && (
              <>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div
                    key={n}
                    className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/30 animate-pulse"
                  >
                    <div className="h-44 bg-surface-container-high" />
                    <div className="p-5 space-y-3">
                      <div className="h-5 bg-surface-container-high rounded w-2/3" />
                      <div className="h-4 bg-surface-container-low rounded w-full" />
                      <div className="h-8 bg-surface-container-low rounded" />
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="h-10 bg-surface-container-high rounded-lg" />
                        <div className="h-10 bg-surface-container-high rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {!isLoadingCrops && cropsError && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 bg-surface-container-lowest rounded-2xl p-8 text-center flex flex-col items-center justify-center space-y-4 border border-error/30 shadow-sm">
                <div className="w-12 h-12 rounded-full bg-error-container/30 flex items-center justify-center text-error">
                  <span className="material-symbols-outlined text-3xl">error_outline</span>
                </div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Failed to load major crops
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                  {cropsError}
                </p>
                <button
                  type="button"
                  onClick={fetchCrops}
                  className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold shadow hover:bg-primary-container transition-colors inline-flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  <span>Retry</span>
                </button>
              </div>
            )}

            {!isLoadingCrops &&
              !cropsError &&
              filteredCrops.map((c) => (
              <div
                key={c.id}
                className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col border border-outline-variant/30"
              >
                <div className="relative h-44 w-full overflow-hidden bg-surface-container">
                  <img
                    alt={c.imageAlt}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    src={c.imageUrl}
                    loading="lazy"
                    width={400}
                    height={176}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-surface-container-lowest/90 backdrop-blur-md text-primary font-label-sm text-label-sm font-bold shadow-sm">
                    {c.badge}
                  </span>
                  <span className="absolute bottom-3 right-3 px-2.5 py-0.5 rounded-md bg-inverse-surface/80 text-inverse-on-surface font-label-sm text-[11px]">
                    {c.idealSoil}
                  </span>
                </div>
                <div className="p-5 flex flex-col flex-1 justify-between">
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                        {c.nameEn}
                      </h3>
                      <span className="font-label-sm text-label-sm text-secondary font-bold">
                        {c.marketPrice}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mb-3">
                      {c.tagline}. {c.description}
                    </p>
                    <div className="flex items-center justify-between text-on-surface font-label-sm text-label-sm py-2 bg-surface-container-low px-3 rounded-lg border border-outline-variant/20">
                      <span className="text-on-surface-variant">Average Yield:</span>
                      <span className="font-bold text-primary">{c.avgYield}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => onSelectCropForGuide(c)}
                      className="py-2.5 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface text-center font-label-sm text-label-sm font-semibold transition-colors"
                      type="button"
                    >
                      Cultivation Guide
                    </button>
                    <button
                      onClick={() => {
                        onSetQuickAdvisory(c.id, district, soil);
                        onNavigate('get-advice');
                      }}
                      className="py-2.5 px-3 rounded-lg bg-primary text-on-primary hover:bg-primary-container text-center font-label-sm text-label-sm font-semibold transition-colors"
                      type="button"
                    >
                      Get Advisory →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Farmer Testimonial / Community Quote bar */}
      <section className="w-full py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1200px] mx-auto">
          <div className="p-8 sm:p-10 rounded-3xl bg-primary-container text-on-primary shadow-xl relative overflow-hidden">
            <svg
              className="absolute -right-8 -bottom-12 w-64 h-64 text-on-primary-container/10 pointer-events-none"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z"></path>
            </svg>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              <div className="lg:col-span-8 flex flex-col gap-4">
                <div className="flex items-center gap-1 text-secondary-fixed">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className="material-symbols-outlined text-[20px] fill">star</span>
                  ))}
                  <span className="ml-2 font-label-sm text-label-sm text-primary-fixed font-semibold">
                    Farmer Verified Experience
                  </span>
                </div>
                <blockquote className="font-headline-lg text-headline-lg font-bold leading-snug tracking-tight text-white">
                  “KisanSathi’s fertilizer timing saved me 3 bags of DAP per acre and improved my crop yield significantly!”
                </blockquote>
                <p className="font-body-md text-body-md text-on-primary-container leading-relaxed">
                  "Before pests appeared on my crops last year, I received timely alerts from the app. Spraying organic neem oil at the right time saved my harvest completely and secured top market rates."
                </p>
                <div className="flex items-center gap-4 pt-2">
                  <div className="w-12 h-12 rounded-full bg-surface-container-lowest/20 flex items-center justify-center font-bold text-white text-lg ring-2 ring-white/30">
                    RK
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm font-bold text-white">
                      Ramesh Kumar
                    </span>
                    <span className="font-label-sm text-label-sm text-on-primary-container">
                      Progressive Farmer • Member, National Farmers Network
                    </span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-4 flex flex-col gap-4 bg-surface-container-lowest/10 backdrop-blur-md p-6 rounded-2xl border border-white/10">
                <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-secondary-fixed">
                  All-India Farmer Advisory Network
                </span>
                <div className="flex flex-col gap-2">
                  <span className="font-display-lg text-display-lg font-bold text-white">1,80,000+</span>
                  <span className="font-body-sm text-body-sm text-on-primary-container">
                    Active farmers receiving seasonal advisory across 50,000+ Indian villages.
                  </span>
                </div>
                <a
                  className="mt-2 inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-secondary-container text-on-secondary-fixed font-label-md text-label-md font-bold shadow-md hover:bg-secondary-fixed transition-colors"
                  href="tel:18001801551"
                >
                  <span className="material-symbols-outlined text-[20px]">call</span>
                  <span>1800-180-1551 Toll-Free Helpline</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. Floating Voice Advisory Action Button */}
      <div className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6">
        <button
          onClick={onOpenVoiceModal}
          aria-label="Voice Assistance"
          className="flex items-center gap-2.5 px-5 py-3.5 rounded-full bg-secondary text-white shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-white/20"
          type="button"
        >
          <span className="material-symbols-outlined text-2xl animate-pulse">mic</span>
          <div className="flex flex-col text-left">
            <span className="font-label-sm text-label-sm font-bold leading-tight">Voice Advice</span>
            <span className="font-label-sm text-[11px] leading-tight opacity-90">Instant Assistant</span>
          </div>
        </button>
      </div>
    </div>
  );
};
