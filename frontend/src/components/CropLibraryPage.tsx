import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CropInfo, CropSummary } from '../types';
import { getCrops } from '../api/client';

interface CropLibraryPageProps {
  onSelectCropForGuide: (crop: CropSummary | CropInfo) => void;
  onRequestNewCrop: () => void;
}

export const CropLibraryPage: React.FC<CropLibraryPageProps> = ({
  onSelectCropForGuide,
  onRequestNewCrop,
}) => {
  const [crops, setCrops] = useState<CropSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popularity');
  const abortControllerRef = useRef<AbortController | null>(null);

  const filterPills = [
    { id: 'all', label: 'All Crops', icon: 'apps' },
    { id: 'kharif', label: 'Kharif', icon: 'rainy' },
    { id: 'rabi', label: 'Rabi', icon: 'ac_unit' },
    { id: 'summer', label: 'Zaid / Summer', icon: 'wb_sunny' },
    { id: 'cash', label: 'Cash Crops', icon: 'currency_rupee' },
    { id: 'spice', label: 'Spices', icon: 'spa' },
  ];

  // Debounce search query by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load crops from backend API whenever debouncedSearch or activeFilter changes
  const fetchCrops = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    // Map season query parameter for backend API (kharif, rabi, zaid)
    let seasonParam: string | undefined;
    if (activeFilter === 'kharif') seasonParam = 'kharif';
    else if (activeFilter === 'rabi') seasonParam = 'rabi';
    else if (activeFilter === 'summer') seasonParam = 'zaid';

    const searchParam = debouncedSearch.trim() || undefined;

    getCrops({ season: seasonParam, search: searchParam }, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setCrops(res.crops || []);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          const msg = err instanceof Error ? err.message : 'Failed to load crops';
          setError(msg);
        }
      });
  };

  useEffect(() => {
    fetchCrops();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedSearch, activeFilter]);

  // Filter and sort crops for presentation
  const filteredCrops = useMemo(() => {
    let list = crops;

    // Client-side category filter for special categories (cash, spice)
    if (activeFilter === 'cash' || activeFilter === 'spice') {
      list = list.filter((crop) => crop.category && crop.category.includes(activeFilter));
    }

    // Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === 'popularity') {
        return (b.popularityScore ?? 0) - (a.popularityScore ?? 0);
      } else if (sortBy === 'water') {
        const order: Record<string, number> = { 'very-low': 1, low: 2, medium: 3, high: 4 };
        return (order[a.waterLevel] ?? 2) - (order[b.waterLevel] ?? 2);
      } else if (sortBy === 'duration') {
        return (a.durationDays ?? 0) - (b.durationDays ?? 0);
      } else if (sortBy === 'profit') {
        return (b.profitScore ?? 0) - (a.profitScore ?? 0);
      }
      return 0;
    });

    return list;
  }, [crops, activeFilter, sortBy]);

  return (
    <div className="flex flex-col w-full">
      <div className="relative w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Header, Search & Filter Matrix */}
        <section className="relative bg-surface-container-lowest rounded-2xl p-6 sm:p-8 lg:p-10 shadow-sm overflow-hidden border border-outline-variant/30">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary-fixed/25 blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-secondary-fixed/30 blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col gap-6">
            <div className="flex flex-col gap-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 text-secondary font-label-sm text-label-sm tracking-wide uppercase font-bold">
                <span className="material-symbols-outlined text-[18px]">menu_book</span>
                <span>National Crop Knowledge Repository • Authentic ICAR &amp; State Agronomy Data</span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">
                All-India Crop Knowledge Library
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
                Explore scientific cultivation practices, soil compatibility, and market value for major field crops and cash crops grown across India.
              </p>
            </div>

            {/* Search Bar & Sort Dropdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-2">
              <div className="lg:col-span-9 relative flex items-center">
                <span className="material-symbols-outlined absolute left-4 text-outline text-2xl pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  id="cropSearchInput"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search crop by name (e.g. Wheat, Rice, Cotton, Maize, Chana...)"
                  className="w-full h-14 pl-12 pr-10 bg-surface-container-low text-on-surface placeholder:text-outline font-body-md text-body-md rounded-xl outline-none focus:bg-surface-container focus:ring-2 focus:ring-primary transition-all duration-200 border border-outline-variant/30"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 text-outline hover:text-on-surface p-1"
                  >
                    <span className="material-symbols-outlined text-xl">close</span>
                  </button>
                )}
              </div>

              <div className="lg:col-span-3 flex items-center">
                <div className="w-full relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full h-14 px-4 bg-surface-container text-on-surface font-label-md text-label-md rounded-xl appearance-none cursor-pointer outline-none focus:ring-2 focus:ring-primary transition-all border border-outline-variant/30 pr-10 font-semibold"
                  >
                    <option value="popularity">Sort by Popularity in India</option>
                    <option value="water">Sort by Water Requirement</option>
                    <option value="duration">Sort by Maturity Duration</option>
                    <option value="profit">Sort by High Profit Margin</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline pointer-events-none">
                    swap_vert
                  </span>
                </div>
              </div>
            </div>

            {/* Season / Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
              {filterPills.map((pill) => {
                const isActive = activeFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setActiveFilter(pill.id)}
                    className={`shrink-0 px-4 py-2.5 rounded-full font-label-md text-label-md transition-all shadow-sm flex items-center gap-1.5 border font-semibold ${
                      isActive
                        ? 'bg-primary-container text-on-primary border-primary'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border-outline-variant/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{pill.icon}</span>
                    <span>{pill.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Summary Ribbon */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 text-on-surface-variant text-body-sm font-body-sm border-t border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block"></span>
                <span>
                  Showing <strong className="text-on-surface font-bold">{filteredCrops.length}</strong> major Indian crops profiled for national agro-climatic zones
                </span>
              </div>
              <div className="inline-flex items-center gap-2 text-secondary font-label-sm text-label-sm font-semibold">
                <span className="material-symbols-outlined text-[16px]">verified</span>
                <span>Verified with Indian Council of Agricultural Research (ICAR) &amp; Agronomy Protocols</span>
              </div>
            </div>
          </div>
        </section>

        {/* 8-Crop Detailed Bento Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Loading Skeleton */}
          {isLoading && (
            <>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/30 animate-pulse"
                >
                  <div className="h-48 bg-surface-container-high" />
                  <div className="p-5 space-y-4">
                    <div className="h-5 bg-surface-container-high rounded w-3/4" />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-12 bg-surface-container-low rounded-xl" />
                      <div className="h-12 bg-surface-container-low rounded-xl" />
                    </div>
                    <div className="h-10 bg-surface-container-high rounded-xl" />
                  </div>
                </div>
              ))}
            </>
          )}

          {/* Error State with Retry */}
          {!isLoading && error && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-surface-container-lowest rounded-2xl p-10 text-center flex flex-col items-center justify-center space-y-4 border border-error/30 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-error-container/30 flex items-center justify-center text-error">
                <span className="material-symbols-outlined text-4xl">error_outline</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                Failed to load crops
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                {error}
              </p>
              <button
                type="button"
                onClick={fetchCrops}
                className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold shadow hover:bg-primary-container transition-colors inline-flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Loaded Crops */}
          {!isLoading &&
            !error &&
            filteredCrops.map((crop) => (
              <article
                key={crop.id}
                className="group flex flex-col bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-outline-variant/30"
              >
                <div className="relative h-48 w-full overflow-hidden bg-surface-container">
                  <img
                    alt={crop.imageAlt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    src={crop.imageUrl}
                    loading="lazy"
                    width={400}
                    height={192}
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = 'none';
                    }}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/85 via-transparent to-transparent"></div>

                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="bg-surface-container-lowest/90 backdrop-blur-sm text-primary font-label-sm text-label-sm px-3 py-1 rounded-full shadow-sm font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">local_florist</span>
                      <span>{crop.badge}</span>
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white">
                    <div>
                      <p className="font-label-sm text-label-sm text-primary-fixed">{crop.scientificName}</p>
                      <h2 className="font-headline-md text-headline-md font-bold text-white leading-tight">
                        {crop.nameEn}
                      </h2>
                    </div>
                    <span className="bg-primary/80 backdrop-blur-md text-white text-label-sm font-label-sm px-2 py-0.5 rounded-md font-semibold">
                      {crop.varietyTag}
                    </span>
                  </div>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-body-sm font-body-sm">
                    <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/20">
                      <span className="text-on-surface-variant block text-label-sm font-label-sm">Ideal Soil</span>
                      <span className="font-semibold text-on-surface">{crop.idealSoil}</span>
                    </div>
                    <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/20">
                      <span className="text-on-surface-variant block text-label-sm font-label-sm">Duration</span>
                      <span className="font-semibold text-on-surface">{crop.duration}</span>
                    </div>
                    <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/20">
                      <span className="text-on-surface-variant block text-label-sm font-label-sm">Water Need</span>
                      <span className="font-semibold text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">water_drop</span> {crop.waterNeed}
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant/20">
                      <span className="text-on-surface-variant block text-label-sm font-label-sm">{crop.metricTitle}</span>
                      <span className="font-semibold text-secondary flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">stars</span> {crop.metricValue}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-body-sm font-body-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">location_on</span>
                      <span>
                        <strong className="text-on-surface font-semibold">Hubs:</strong> {crop.hubs}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-body-sm font-body-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-secondary text-[18px] shrink-0 mt-0.5">verified</span>
                      <span className="line-clamp-2">{crop.description}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onSelectCropForGuide(crop)}
                      className="w-full h-12 bg-primary text-on-primary hover:bg-primary-container transition-colors rounded-xl font-label-md text-label-md font-bold flex items-center justify-center gap-2 shadow-sm"
                    >
                      <span>View Cultivation Guide</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}

          {/* Empty State Card */}
          {!isLoading && !error && filteredCrops.length === 0 && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-surface-container-lowest rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-4 border border-outline-variant/30">
              <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-4xl">travel_explore</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                No crops found matching your search
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                Try searching with alternative spelling (e.g., Wheat, Rice, Cotton, Chana) or filter by another season category.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
                className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold"
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>

        {/* Section: All-India Agro-Climatic Zones Comparison & Sowing Calendar */}
        <section className="bg-surface-container-lowest rounded-2xl p-6 sm:p-8 lg:p-10 shadow-sm space-y-6 border border-outline-variant/30">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
            <div>
              <div className="inline-flex items-center gap-1.5 text-primary font-label-sm text-label-sm font-bold uppercase tracking-wider">
                <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                <span>Agro-Climatic Intelligence</span>
              </div>
              <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mt-1 font-bold">
                At a Glance: Sowing Calendar for Indian Agro-Climatic Zones
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Scientific timing recommendations aligned with monsoon onset and winter humidity across key farming belts.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-label-sm font-label-sm text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/20 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block"></span> Optimal Sowing
              </span>
              <span className="inline-flex items-center gap-1 text-label-sm font-label-sm text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full border border-outline-variant/20 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary inline-block"></span> Harvest Window
              </span>
            </div>
          </div>

          {/* Comparison Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-surface-container text-on-surface font-label-md text-label-md font-bold">
                  <th className="py-4 px-5">Agro Zone</th>
                  <th className="py-4 px-5">Soil Profile</th>
                  <th className="py-4 px-5">Kharif Window</th>
                  <th className="py-4 px-5">Rabi Window</th>
                  <th className="py-4 px-5">Primary Cash Crops</th>
                  <th className="py-4 px-5">Advisory Status</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm text-on-surface divide-y divide-surface-container">
                <tr className="hover:bg-surface-container-low transition-colors">
                  <td className="py-4 px-5 font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">landscape</span>
                    <span>Northern Plains</span>
                  </td>
                  <td className="py-4 px-5 text-on-surface-variant">Deep Alluvial &amp; Loamy</td>
                  <td className="py-4 px-5 font-semibold">15 June – 15 July</td>
                  <td className="py-4 px-5 font-semibold">25 Oct – 20 Nov</td>
                  <td className="py-4 px-5">Wheat, Rice, Sugarcane, Mustard</td>
                  <td className="py-4 px-5">
                    <span className="bg-surface-container-high text-primary font-label-sm text-label-sm px-3 py-1 rounded-full font-bold">
                      Active Advisory
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-surface-container-low transition-colors">
                  <td className="py-4 px-5 font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-xl">wb_sunny</span>
                    <span>Central &amp; Western Plateau</span>
                  </td>
                  <td className="py-4 px-5 text-on-surface-variant">Black Regur &amp; Medium Loam</td>
                  <td className="py-4 px-5 font-semibold">20 June – 15 July</td>
                  <td className="py-4 px-5 font-semibold">15 Oct – 15 Nov</td>
                  <td className="py-4 px-5">Cotton, Soybean, Chickpea, Groundnut</td>
                  <td className="py-4 px-5">
                    <span className="bg-surface-container-high text-primary font-label-sm text-label-sm px-3 py-1 rounded-full font-bold">
                      Active Advisory
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-surface-container-low transition-colors">
                  <td className="py-4 px-5 font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-tertiary text-xl">water</span>
                    <span>Eastern &amp; Delta Region</span>
                  </td>
                  <td className="py-4 px-5 text-on-surface-variant">Alluvial, Red &amp; Coastal Clay</td>
                  <td className="py-4 px-5 font-semibold">10 June – 10 July</td>
                  <td className="py-4 px-5 font-semibold">01 Nov – 30 Nov</td>
                  <td className="py-4 px-5">Rice, Maize, Potato, Pulses</td>
                  <td className="py-4 px-5">
                    <span className="bg-secondary-fixed/50 text-on-secondary-fixed font-label-sm text-label-sm px-3 py-1 rounded-full font-bold">
                      Monsoon Monitored
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-surface-container-low transition-colors">
                  <td className="py-4 px-5 font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-xl">forest</span>
                    <span>Southern Peninsular</span>
                  </td>
                  <td className="py-4 px-5 text-on-surface-variant">Red, Laterite &amp; Black Soil</td>
                  <td className="py-4 px-5 font-semibold">01 June – 30 June</td>
                  <td className="py-4 px-5 font-semibold">15 Oct – 15 Dec</td>
                  <td className="py-4 px-5">Paddy, Cotton, Jowar, Spices</td>
                  <td className="py-4 px-5">
                    <span className="bg-surface-container-high text-primary font-label-sm text-label-sm px-3 py-1 rounded-full font-bold">
                      Micro-Irrigation
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* KVK Submission / Request Callout */}
          <div className="mt-6 p-6 rounded-xl bg-surface-container flex flex-col md:flex-row items-center justify-between gap-6 border border-outline-variant/30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-2xl">support_agent</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Don't see your regional crop variety?
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Submit crop guide request to Krishi Vigyan Kendra (KVK) agronomy scientists.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={onRequestNewCrop}
                className="w-full md:w-auto px-6 h-12 bg-secondary text-white hover:bg-secondary/90 transition-colors rounded-xl font-label-md text-label-md font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add_task</span>
                <span>Request New Crop Guide</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
