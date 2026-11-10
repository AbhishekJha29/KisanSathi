import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PageId, Theme, AdvisoryFormData, CropInfo, CropSummary, AdvisoryResultData } from './types';
import { postAdvisory, checkBackendHealth } from './api/client';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomePage } from './components/HomePage';
import { GetAdvicePage } from './components/GetAdvicePage';
import { ResultsPage } from './components/ResultsPage';


// Lazy-load secondary views and modals to reduce initial bundle size
const CropLibraryPage = React.lazy(() =>
  import('./components/CropLibraryPage').then((m) => ({ default: m.CropLibraryPage }))
);
const AboutPage = React.lazy(() =>
  import('./components/AboutPage').then((m) => ({ default: m.AboutPage }))
);
const VoiceAssistantModal = React.lazy(() =>
  import('./components/Modals').then((m) => ({ default: m.VoiceAssistantModal }))
);
const CultivationGuideModal = React.lazy(() =>
  import('./components/Modals').then((m) => ({ default: m.CultivationGuideModal }))
);
const RequestCropModal = React.lazy(() =>
  import('./components/Modals').then((m) => ({ default: m.RequestCropModal }))
);

const SuspenseFallback: React.FC = () => (
  <div className="min-h-[40vh] flex items-center justify-center p-8" role="status" aria-label="Loading content">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function App() {
  // Navigation
  const [currentPage, setCurrentPage] = useState<PageId>('home');

  // Theme
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('kisansathi-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  // Active Advisory Form Data
  const [formData, setFormData] = useState<AdvisoryFormData>({
    crop: 'wheat',
    soilType: 'loamy',
    season: 'rabi',
    state: 'Uttar Pradesh',
    district: 'Varanasi',
    block: '',
    waterSource: 'canal',
    landSize: 5.0,
    landUnit: 'acres',
  });

  // Current Advisory Result Data
  const [advisoryResult, setAdvisoryResult] = useState<AdvisoryResultData | null>(null);

  // Modals
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [cropForGuide, setCropForGuide] = useState<CropSummary | CropInfo | null>(null);
  const [requestCropModalOpen, setRequestCropModalOpen] = useState(false);

  // Backend Health State (polled once per 30 seconds)
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true);
  const [isOfflineBannerDismissed, setIsOfflineBannerDismissed] = useState<boolean>(false);

  // Sync dark class on root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('kisansathi-theme', theme);
  }, [theme]);

  // Clean up stale language key on app start
  useEffect(() => {
    localStorage.removeItem('kisansathi-lang');
  }, []);

  // Poll backend health every 30 seconds
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const status = await checkBackendHealth();
      if (mounted) {
        setIsBackendOnline(status);
        if (status) {
          setIsOfflineBannerDismissed(false);
        }
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Pre-generate initial default advisory in background
  useEffect(() => {
    let mounted = true;
    postAdvisory(formData)
      .then((res) => {
        if (mounted) {
          setAdvisoryResult(res);
        }
      })
      .catch(() => {
        // Backend offline or error handled gracefully
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Handle URL hash changes
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (['home', 'get-advice', 'results', 'crop-library', 'about'].includes(hash)) {
        setCurrentPage(hash as PageId);
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleNavigate = (page: PageId) => {
    setCurrentPage(page);
    window.location.hash = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };


  const handleSetQuickAdvisory = async (cropId: string, districtName: string, soilTypeName: string) => {
    const updated: AdvisoryFormData = {
      ...formData,
      crop: cropId,
      district: districtName,
      soilType: soilTypeName,
    };
    setFormData(updated);
    try {
      const res = await postAdvisory(updated);
      setAdvisoryResult(res);
    } catch (err) {
      console.error('Failed to pre-generate quick advisory:', err);
    }
  };

  const handleSubmitAdvice = (data: AdvisoryFormData, result: AdvisoryResultData) => {
    setFormData(data);
    setAdvisoryResult(result);
    handleNavigate('results');
  };

  const handleSelectCropForAdvice = (cropId: string) => {
    const updated: AdvisoryFormData = {
      ...formData,
      crop: cropId,
    };
    setFormData(updated);
    handleNavigate('get-advice');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-surface transition-colors duration-200">
      {/* Global Navigation Header */}
      <Header
        currentPage={currentPage}
        onNavigate={handleNavigate}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      {/* Main View Container with Smooth Page Transitions */}
      <main className="flex-1 w-full pt-20">
        {/* Offline Banner under navbar for Get Advice and Crop Library */}
        {!isBackendOnline && !isOfflineBannerDismissed && (currentPage === 'get-advice' || currentPage === 'crop-library') && (
          <div className="bg-error-container text-on-error-container px-4 py-2.5 text-center text-sm font-medium flex items-center justify-between border-b border-error/20 shadow-sm animate-in fade-in">
            <div className="flex-1 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-error">cloud_off</span>
              <span>Server is offline. Start the backend and refresh.</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOfflineBannerDismissed(true)}
              className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors text-on-error-container shrink-0"
              aria-label="Dismiss banner"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {currentPage === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <HomePage
                onNavigate={handleNavigate}
                onSetQuickAdvisory={handleSetQuickAdvisory}
                onOpenVoiceModal={() => setVoiceModalOpen(true)}
                onSelectCropForGuide={(crop) => setCropForGuide(crop)}
              />
            </motion.div>
          )}

          {currentPage === 'get-advice' && (
            <motion.div
              key="get-advice"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <GetAdvicePage
                formData={formData}
                onUpdateFormData={setFormData}
                onSubmitAdvice={handleSubmitAdvice}
                onNavigate={handleNavigate}
              />
            </motion.div>
          )}

          {currentPage === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <ResultsPage
                advisory={advisoryResult}
                onNavigate={handleNavigate}
              />
            </motion.div>
          )}

          {currentPage === 'crop-library' && (
            <motion.div
              key="crop-library"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <React.Suspense fallback={<SuspenseFallback />}>
                <CropLibraryPage
                  onSelectCropForGuide={(crop) => setCropForGuide(crop)}
                  onRequestNewCrop={() => setRequestCropModalOpen(true)}
                />
              </React.Suspense>
            </motion.div>
          )}

          {currentPage === 'about' && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <React.Suspense fallback={<SuspenseFallback />}>
                <AboutPage onNavigate={handleNavigate} />
              </React.Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Footer */}
      <Footer
        onNavigate={handleNavigate}
        isBackendOnline={isBackendOnline}
      />

      {/* Modals & Dialogs (loaded dynamically on demand) */}
      <React.Suspense fallback={null}>
        {voiceModalOpen && (
          <VoiceAssistantModal
            isOpen={voiceModalOpen}
            onClose={() => setVoiceModalOpen(false)}
            onNavigate={handleNavigate}
          />
        )}

        {cropForGuide && (
          <CultivationGuideModal
            crop={cropForGuide}
            onClose={() => setCropForGuide(null)}
            onSelectForAdvice={handleSelectCropForAdvice}
          />
        )}

        {requestCropModalOpen && (
          <RequestCropModal
            isOpen={requestCropModalOpen}
            onClose={() => setRequestCropModalOpen(false)}
          />
        )}

      </React.Suspense>
    </div>
  );
}
