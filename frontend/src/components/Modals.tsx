import React, { useState, useEffect, useRef } from 'react';
import { CropInfo, CropSummary, CropDetail, PageId } from '../types';
import { getCrop } from '../api/client';
import { speakText, stopSpeaking } from '../utils/speechUtils';

/**
 * Custom accessibility hook for accessible modals:
 * - Traps focus with Tab / Shift+Tab wrapping
 * - Closes modal on Escape key press
 * - Returns focus to trigger button upon close
 */
function useModalA11y(isOpen: boolean, onClose: () => void) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        if (modalRef.current) {
          const focusables = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length > 0) {
            focusables[0].focus();
          } else {
            modalRef.current.focus();
          }
        }
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          return;
        }

        if (e.key === 'Tab' && modalRef.current) {
          const focusables = modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length === 0) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleKeyDown);
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  return modalRef;
}

// 1. Voice Assistant Modal
interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
}

export const VoiceAssistantModal: React.FC<VoiceModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useModalA11y(isOpen, onClose);
  const [isListening, setIsListening] = useState(false);
  const [currentQuery, setCurrentQuery] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  if (!isOpen) return null;

  const quickQuestions = [
    {
      q: 'What should I do for pink bollworm in cotton?',
      a: 'To prevent pink bollworm in cotton, install 5 pheromone traps per acre 45 days after sowing and use Trichogramma cards during flowering. For severe infestations, spray Profenofos + Cypermethrin.',
    },
    {
      q: 'When should gypsum be applied to groundnut?',
      a: 'Apply 150 kg gypsum per acre near plant roots at the pegging stage (35 to 40 days after sowing) for optimal pod filling.',
    },
    {
      q: "What is today's cotton price in the market yard?",
      a: 'Today, medium and long staple cotton prices range from ₹7,200 to ₹7,850 per quintal across major APMC market yards.',
    },
    {
      q: 'How to prevent blight disease in cumin?',
      a: 'Spray Mancozeb 75 WP (25g per 10 liters of water) before cloudy weather sets in to protect against cumin blight.',
    },
  ];

  const handleSelectQuestion = (item: (typeof quickQuestions)[0]) => {
    setCurrentQuery(item.q);
    setAnswer(item.a);
    setIsListening(false);
    speakText(
      item.a,
      'en-IN',
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );
  };

  const handleStartMic = () => {
    setIsListening(true);
    setAnswer(null);
    setCurrentQuery('Listening... please speak your question...');
    setTimeout(() => {
      handleSelectQuestion(quickQuestions[0]);
    }, 2000);
  };

  const handleClose = () => {
    stopSpeaking();
    setIsSpeaking(false);
    setIsListening(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="KisanSathi Voice Assistant"
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-outline-variant/30 relative outline-none"
      >
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          type="button"
          aria-label="Close voice assistant modal"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className="relative">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl transition-all duration-300 ${
                isListening
                  ? 'bg-error scale-110 animate-pulse ring-8 ring-error/20'
                  : isSpeaking
                  ? 'bg-primary ring-8 ring-primary/20 animate-bounce'
                  : 'bg-secondary hover:scale-105'
              }`}
            >
              <span className="material-symbols-outlined text-3xl">
                {isListening ? 'graphic_eq' : isSpeaking ? 'volume_up' : 'mic'}
              </span>
            </div>
          </div>

          <div>
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
              KisanSathi Voice Assistant
            </h3>
            <p className="font-label-sm text-label-sm text-secondary font-bold">
              Voice Agro-Assistant
            </p>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {currentQuery || 'Speak your question or choose from the options below:'}
            </p>
          </div>

          {!isListening && (
            <button
              onClick={handleStartMic}
              type="button"
              className="px-6 py-2.5 rounded-full bg-secondary-container text-on-secondary-fixed font-label-md text-label-md font-bold shadow-sm hover:bg-secondary-fixed transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">mic</span>
              <span>Tap to Speak</span>
            </button>
          )}

          {/* Quick Questions Grid */}
          <div className="w-full text-left space-y-2 mt-2">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-bold block">
              Frequently Asked Questions (Quick Ask):
            </span>
            <div className="grid grid-cols-1 gap-2">
              {quickQuestions.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectQuestion(item)}
                  className="p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface text-left font-label-sm text-label-sm transition-all border border-outline-variant/20 flex items-start gap-2"
                >
                  <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5">
                    play_circle
                  </span>
                  <div>
                    <span className="font-bold">{item.q}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Answer Box */}
          {answer && (
            <div className="w-full text-left p-4 rounded-xl bg-surface-container border border-primary/30 mt-2 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-primary font-label-sm text-label-sm font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">psychiatry</span>
                  <span>Agronomist Answer:</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    speakText(answer, 'en-IN', () => setIsSpeaking(true), () => setIsSpeaking(false));
                  }}
                  className="hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">replay</span>
                  <span>Listen Again</span>
                </button>
              </div>
              <p className="font-body-md text-body-md text-on-surface leading-relaxed">{answer}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 2. Cultivation Guide Modal
interface CultivationModalProps {
  crop: CropInfo | CropSummary | null;
  onClose: () => void;
  onSelectForAdvice: (cropId: string) => void;
}

export const CultivationGuideModal: React.FC<CultivationModalProps> = ({
  crop,
  onClose,
  onSelectForAdvice,
}) => {
  const modalRef = useModalA11y(!!crop, onClose);
  const [detail, setDetail] = useState<CropDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!crop) {
      setDetail(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    getCrop(crop.id)
      .then((res) => {
        if (mounted) {
          setDetail(res);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setIsLoading(false);
          const msg = err instanceof Error ? err.message : 'Failed to load crop details';
          setError(msg);
        }
      });

    return () => {
      mounted = false;
    };
  }, [crop?.id]);

  const handleRetry = () => {
    if (!crop) return;
    setIsLoading(true);
    setError(null);
    getCrop(crop.id)
      .then((res) => {
        setDetail(res);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        setIsLoading(false);
        const msg = err instanceof Error ? err.message : 'Failed to load crop details';
        setError(msg);
      });
  };

  if (!crop) return null;

  const activeCrop = detail || crop;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={activeCrop ? `${activeCrop.nameEn} Cultivation Guide` : 'Cultivation Guide'}
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-outline-variant/30 relative outline-none"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          type="button"
          aria-label="Close modal"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        {/* Header with Crop Image Banner */}
        <div className="relative h-48 rounded-2xl overflow-hidden mb-6 bg-surface-container">
          <img
            alt={activeCrop.imageAlt}
            className="w-full h-full object-cover"
            src={activeCrop.imageUrl}
            loading="lazy"
            width={600}
            height={192}
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/85 via-transparent to-transparent flex items-end p-5">
            <div>
              <span className="bg-primary px-3 py-1 rounded-full text-white font-label-sm text-label-sm font-bold shadow-sm">
                {activeCrop.badge} • {activeCrop.varietyTag}
              </span>
              <h2 className="font-headline-lg text-headline-lg font-bold text-white mt-1">
                {activeCrop.nameEn}
              </h2>
              <p className="font-label-sm text-label-sm text-primary-fixed">{activeCrop.scientificName}</p>
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="font-body-md text-body-md text-on-surface-variant font-medium">
              Loading full cultivation guide...
            </p>
          </div>
        )}

        {/* Error State with Retry */}
        {!isLoading && error && (
          <div className="p-6 rounded-2xl bg-surface-container-low text-center space-y-4 border border-error/30 my-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-error-container/40 text-error flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">error_outline</span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {error}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-5 py-2 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold shadow hover:bg-primary-container transition-colors inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loaded Content */}
        {!isLoading && !error && (
          <div className="space-y-6">
            <div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-2">
                Package of Practices
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {detail?.description || activeCrop.description}
              </p>
              {detail && detail.introTipEn && (
                <div className="mt-3 p-3 rounded-xl bg-primary-fixed/20 border border-primary/20 flex items-start gap-2 text-on-surface text-body-sm font-body-sm">
                  <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">tips_and_updates</span>
                  <span>{detail.introTipEn}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="block font-label-sm text-label-sm text-on-surface-variant">Ideal Soil</span>
                <span className="font-bold text-on-surface">{activeCrop.idealSoil}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="block font-label-sm text-label-sm text-on-surface-variant">Duration</span>
                <span className="font-bold text-on-surface">{activeCrop.duration}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="block font-label-sm text-label-sm text-on-surface-variant">Seed Rate</span>
                <span className="font-bold text-on-surface">{detail?.seedRate || 'Standard recommendation'}</span>
              </div>
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20">
                <span className="block font-label-sm text-label-sm text-on-surface-variant">Spacing</span>
                <span className="font-bold text-on-surface">{detail?.spacing || 'Standard spacing'}</span>
              </div>
            </div>

            {/* Fertilizer Breakdown */}
            <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-3">
              <div className="flex items-center gap-2 text-primary font-label-md text-label-md font-bold">
                <span className="material-symbols-outlined text-[20px]">compost</span>
                <span>Standard Scientific Fertilizer Dose:</span>
              </div>
              {detail?.fertilizerStages && detail.fertilizerStages.length > 0 ? (
                <div className="space-y-2">
                  {detail.fertilizerStages.map((stage) => (
                    <div
                      key={stage.stageOrder}
                      className="p-3 rounded-lg bg-surface-container border border-outline-variant/20 text-body-sm font-body-sm"
                    >
                      <div className="flex items-center justify-between font-semibold text-on-surface">
                        <span>{stage.stageEn} ({stage.timingEn})</span>
                        <span className="text-primary font-bold">{stage.quantityPerAcre}</span>
                      </div>
                      <div className="text-on-surface-variant text-xs mt-1">
                        <span className="font-medium text-on-surface">{stage.fertilizerEn}</span> • {stage.applicationMethod}
                      </div>
                    </div>
                  ))}
                </div>
              ) : detail?.fertilizerDose ? (
                <ul className="space-y-1.5 font-body-sm text-body-sm text-on-surface pl-2">
                  <li>• <strong>Basal Dose:</strong> {detail.fertilizerDose.basal}</li>
                  <li>• <strong>Top Dressing 1:</strong> {detail.fertilizerDose.top1}</li>
                  <li>• <strong>Top Dressing 2:</strong> {detail.fertilizerDose.top2}</li>
                </ul>
              ) : (
                <p className="text-body-sm text-on-surface-variant">Recommended balanced NPK application according to soil test results.</p>
              )}
            </div>

            {/* Key Pests & Harvest */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                <span className="font-label-md text-label-md text-error font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">pest_control</span>
                  <span>Key Pests &amp; Diseases:</span>
                </span>
                {detail?.pestsDiseases && detail.pestsDiseases.length > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {detail.pestsDiseases.map((p) => (
                      <div key={p.id} className="p-2.5 rounded-lg bg-surface-container border border-outline-variant/10 text-xs">
                        <div className="flex items-center justify-between font-semibold text-on-surface">
                          <span>{p.nameEn}</span>
                          <span className="px-1.5 py-0.5 rounded bg-error-container/40 text-error font-medium">{p.severity}</span>
                        </div>
                        <p className="text-on-surface-variant mt-1">
                          <strong>Symptoms:</strong> {p.symptomsEn}
                        </p>
                        <p className="text-on-surface-variant mt-0.5">
                          <strong>Control:</strong> {p.controlEn}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : detail?.keyPests && detail.keyPests.length > 0 ? (
                  <ul className="text-body-sm text-body-sm text-on-surface-variant space-y-1">
                    {detail.keyPests.map((p, idx) => (
                      <li key={idx}>• {p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-body-sm text-on-surface-variant">Monitor regularly for sap-sucking pests and foliar leaf spot.</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-2">
                <span className="font-label-md text-label-md text-secondary font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[18px]">event_available</span>
                  <span>Harvesting &amp; Maturity:</span>
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {detail?.harvestingIndicator || 'Harvest when 80-85% of crop turns golden brown and moisture is below 12%.'}
                </p>
                {detail?.irrigation && (
                  <div className="mt-3 pt-3 border-t border-outline-variant/20">
                    <span className="font-label-sm text-label-sm text-primary font-bold flex items-center gap-1 mb-1">
                      <span className="material-symbols-outlined text-base">water_drop</span>
                      <span>Irrigation Advice:</span>
                    </span>
                    <p className="text-xs text-on-surface-variant">
                      {detail.irrigation.frequencyEn}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Action CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onSelectForAdvice(activeCrop.id);
                  onClose();
                }}
                className="w-full sm:flex-1 h-12 bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">psychiatry</span>
                <span>Generate Custom Advisory for {activeCrop.nameEn}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto h-12 px-6 bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md font-semibold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 3. Request Crop Guide Modal
interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RequestCropModal: React.FC<RequestModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useModalA11y(isOpen, onClose);
  const [cropName, setCropName] = useState('');
  const [stateName, setStateName] = useState('Uttar Pradesh');
  const [variety, setVariety] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Request New Crop Guide"
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-outline-variant/30 relative outline-none"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          type="button"
          aria-label="Close request crop modal"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        {!submitted ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-container text-on-secondary-fixed flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">add_task</span>
              </div>
              <div>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Request New Crop Guide
                </h3>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  Krishi Vigyan Kendra (KVK) Scientist Desk
                </p>
              </div>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Submit details for native or emerging crop varieties not currently listed in our knowledge library. Our agronomy specialists will compile and release certified guides.
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="font-label-sm text-label-sm font-bold text-on-surface block mb-1">
                  Crop Name *
                </label>
                <input
                  required
                  type="text"
                  value={cropName}
                  onChange={(e) => setCropName(e.target.value)}
                  placeholder="e.g. Sesame, Isabgol, Coriander"
                  className="w-full h-12 px-4 rounded-xl bg-surface-container-low text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-label-sm font-bold text-on-surface block mb-1">
                  Specific Variety or Hybrid
                </label>
                <input
                  type="text"
                  value={variety}
                  onChange={(e) => setVariety(e.target.value)}
                  placeholder="e.g. Local desi strain, improved hybrid"
                  className="w-full h-12 px-4 rounded-xl bg-surface-container-low text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-label-sm text-label-sm font-bold text-on-surface block mb-1">
                  Your State / UT *
                </label>
                <select
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl bg-surface-container-low text-on-surface border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="Uttar Pradesh">Uttar Pradesh</option>
                  <option value="Madhya Pradesh">Madhya Pradesh</option>
                  <option value="Punjab">Punjab</option>
                  <option value="Haryana">Haryana</option>
                  <option value="Rajasthan">Rajasthan</option>
                  <option value="Maharashtra">Maharashtra</option>
                  <option value="Bihar">Bihar</option>
                  <option value="West Bengal">West Bengal</option>
                  <option value="Andhra Pradesh">Andhra Pradesh</option>
                  <option value="Karnataka">Karnataka</option>
                </select>
              </div>
            </div>

            <div className="pt-3 flex gap-3">
              <button
                type="submit"
                className="flex-1 h-12 bg-primary text-on-primary font-label-md text-label-md font-bold rounded-xl shadow-sm hover:bg-primary-container transition-colors"
              >
                Submit Request
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 h-12 bg-surface-container text-on-surface font-label-md text-label-md rounded-xl hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center py-6 space-y-4 animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-primary-container text-on-primary flex items-center justify-center mx-auto shadow-md">
              <span className="material-symbols-outlined text-3xl">check_circle</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Request Submitted Successfully!
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-sm mx-auto">
              Your inquiry for <strong>{cropName}</strong> in <strong>{stateName}</strong> has been logged with KVK agronomy specialists. You will receive an advisory bulletin update soon.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                onClose();
              }}
              className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-label-md text-label-md font-bold"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// 4. Farmer Profile Modal
interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: PageId) => void;
}

export const FarmerProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const modalRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Farmer Profile"
        tabIndex={-1}
        className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-outline-variant/30 relative outline-none"
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          type="button"
          aria-label="Close farmer profile modal"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <div className="flex flex-col items-center text-center gap-3">
          <img
            alt="Ramesh Patel"
            className="w-20 h-20 rounded-full object-cover ring-4 ring-primary/20 shadow-md bg-surface-container"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVY8HYgFSDezL9gMXdQz78vfQYwA2iXw_OiATAWluyzTL5oKNx2sbeIi0rQIgq6ngdK200vchjCCM91cChEi5gFXOlXC7KNaMZDWhFGb6qzt9NIwErXTvWX5MEBxbZfg21gchQ2Bl1H_cE7tyumU3B8pN6VWlGBs_iww_EwmWq76md6stU-sIIpo1mpSf8_v8R8I4O3HX8Ww9UCXbhU_sqPviXPcJwnZYNetF-7Cdfk0RmqnwMPRB8"
            loading="lazy"
            width={80}
            height={80}
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
            referrerPolicy="no-referrer"
          />
          <div>
            <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
              Ramesh Patel
            </h3>
            <span className="font-label-sm text-label-sm text-secondary font-bold">
              Progressive Smallholder Farmer • National Krishi Network
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              Location: Model Farm, Varanasi, Uttar Pradesh
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Farmer ID:</span>
            <span className="font-mono font-bold text-primary">KS-IN-2026-8841</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Registered Plot:</span>
            <span className="font-bold text-on-surface">5.0 Acres (Loamy Soil)</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Soil Health Card:</span>
            <span className="inline-flex items-center gap-1 text-primary font-bold text-label-sm">
              <span className="material-symbols-outlined text-[16px] fill">verified</span>
              Linked &amp; Active (EC: 0.42)
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Active Mandis:</span>
            <span className="font-bold text-secondary">National e-NAM &amp; Regional Mandi</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onNavigate('results');
              onClose();
            }}
            className="w-full h-12 bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-bold rounded-xl shadow-sm transition-colors"
          >
            View Active Crop Advisory
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-label-md font-semibold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
