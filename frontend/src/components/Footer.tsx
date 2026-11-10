import React, { useState, useEffect } from 'react';
import { PageId } from '../types';
import { checkBackendHealth } from '../api/client';

interface FooterProps {
  onNavigate: (page: PageId) => void;
  isBackendOnline?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, isBackendOnline }) => {
  const [internalOnline, setInternalOnline] = useState<boolean>(false);

  useEffect(() => {
    if (isBackendOnline !== undefined) return;
    let mounted = true;
    checkBackendHealth().then((status) => {
      if (mounted) {
        setInternalOnline(status);
      }
    });
    return () => {
      mounted = false;
    };
  }, [isBackendOnline]);

  const isOnline = isBackendOnline !== undefined ? isBackendOnline : internalOnline;

  return (
    <footer className="w-full bg-surface-container-low text-on-surface mt-16 pt-12 pb-8 border-t border-outline-variant/30 transition-colors duration-200">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10">
          {/* Brand Col */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('home')}>
              <img
                alt="KisanSathi Brand Logo"
                className="h-8 w-auto object-contain"
                src="https://lh3.googleusercontent.com/aida/AEtjO1UwhH8A3E7Rnjgwi3NtU_-k6ma6pGZ2jSATdnaXNNW33-Xyz6eM5V3Blha3AYm5Tiu5WGQmXaED7iJZcPbCRMkjT5lVQ5usQE0ZYIpXDBhRCmCVS_5wyGDa4c9CngOjzWNiD3b5TZCrKNFKA-3ipmPUF7VsDjoWc3_lq1zB6CUbQPsljqGEPa8MbIXT5I4-IEUYtLhYZPrB_hceVov6LveC9y3xChkJ_6h27Py_e5gKFWK4Xq6CFmAefQ"
                referrerPolicy="no-referrer"
              />
              <span className="font-headline-sm text-headline-sm font-bold text-primary">KisanSathi</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Empowering India's farming communities with localized scientific crop advisory, real-time agro-weather alerts, and market clarity for higher yields and sustainable prosperity.
            </p>
            <div className="flex items-center gap-2 text-secondary pt-1">
              <span className="material-symbols-outlined text-lg">nature_people</span>
              <span className="font-label-sm text-label-sm font-semibold">Farmer's Friend India</span>
            </div>
          </div>

          {/* Agri Portals & Tools */}
          <div className="flex flex-col gap-3">
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Agri Portals &amp; Tools</h3>
            <ul className="flex flex-col gap-2 font-body-sm text-body-sm">
              <li 
                onClick={() => onNavigate('results')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">storefront</span>
                <span>APMC Mandi Bhav</span>
              </li>
              <li 
                onClick={() => onNavigate('home')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">thunderstorm</span>
                <span>Agro Weather &amp; Radar</span>
              </li>
              <li 
                onClick={() => onNavigate('get-advice')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">agriculture</span>
                <span>Soil Health Card Portal</span>
              </li>
              <li 
                onClick={() => onNavigate('results')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">science</span>
                <span>Pest &amp; Disease Diagnostic AI</span>
              </li>
            </ul>
          </div>

          {/* Field & Extension */}
          <div className="flex flex-col gap-3">
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Field &amp; Extension</h3>
            <ul className="flex flex-col gap-2 font-body-sm text-body-sm">
              <li 
                onClick={() => onNavigate('about')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">apartment</span>
                <span>Krishi Vigyan Kendra (KVK) Network</span>
              </li>
              <li 
                onClick={() => onNavigate('get-advice')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">water_drop</span>
                <span>Micro-Irrigation (PMKSY) Advisory</span>
              </li>
              <li 
                onClick={() => onNavigate('about')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">diversity_3</span>
                <span>Farmer Producer Orgs (FPO) Network</span>
              </li>
              <li 
                onClick={() => onNavigate('home')}
                className="flex items-center gap-2 text-on-surface-variant hover:text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-sm">record_voice_over</span>
                <span>Regional Voice Broadcast Service</span>
              </li>
            </ul>
          </div>

          {/* Helpline & Emergency */}
          <div className="flex flex-col gap-3 bg-surface-container-lowest p-5 rounded-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border border-outline-variant/30">
            <h3 className="font-label-lg text-label-lg text-on-surface font-semibold">Helpline &amp; Emergency</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Toll-Free Central Kisan Call Centre assistance available 6:00 AM – 10:00 PM.
            </p>
            <a
              href="tel:18001801551"
              className="flex items-center gap-2 text-secondary font-headline-sm text-headline-sm hover:underline font-bold"
            >
              <span className="material-symbols-outlined text-2xl">call</span>
              <span>1800-180-1551</span>
            </a>
            <span className="font-label-sm text-[12px] text-on-surface-variant">
              Supported by Ministry of Agriculture &amp; ICAR Partnership
            </span>
          </div>
        </div>

        {/* Bottom Rights Bar */}
        <div className="pt-8 mt-4 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left border-t border-outline-variant/30">
          <div className="flex flex-wrap items-center gap-3 justify-center md:justify-start">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              © 2026 KisanSathi. Developed for Indian Agricultural Prosperity. All rights reserved.
            </p>
            {/* Backend API status indicator */}
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant font-label-sm text-[12px]"
              title={isOnline ? 'Backend API online' : 'Backend API offline'}
            >
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
                aria-hidden="true"
              />
              <span>{isOnline ? 'API online' : 'API offline'}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-on-surface-variant font-label-sm text-label-sm">
            <button onClick={() => onNavigate('about')} className="hover:text-primary transition-colors">
              Privacy &amp; Data Rights
            </button>
            <span>•</span>
            <button onClick={() => onNavigate('about')} className="hover:text-primary transition-colors">
              KVK Guidelines
            </button>
            <span>•</span>
            <button onClick={() => onNavigate('about')} className="hover:text-primary transition-colors">
              Terms of Service
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
