import React, { useState } from 'react';
import { PageId, Theme } from '../types';

interface HeaderProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  theme,
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: PageId; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'get-advice', label: 'Get Advice' },
    { id: 'results', label: 'Results' },
    { id: 'crop-library', label: 'Crop Library' },
    { id: 'about', label: 'About' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30 transition-colors duration-200">
      <div className="h-20 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand Zone */}
        <div 
          onClick={() => onNavigate('home')}
          className="flex items-center gap-3 shrink-0 cursor-pointer select-none group"
        >
          <img
            alt="KisanSathi Brand Logo"
            className="h-10 w-auto object-contain group-hover:scale-105 transition-transform"
            src="https://lh3.googleusercontent.com/aida/AEtjO1UwhH8A3E7Rnjgwi3NtU_-k6ma6pGZ2jSATdnaXNNW33-Xyz6eM5V3Blha3AYm5Tiu5WGQmXaED7iJZcPbCRMkjT5lVQ5usQE0ZYIpXDBhRCmCVS_5wyGDa4c9CngOjzWNiD3b5TZCrKNFKA-3ipmPUF7VsDjoWc3_lq1zB6CUbQPsljqGEPa8MbIXT5I4-IEUYtLhYZPrB_hceVov6LveC9y3xChkJ_6h27Py_e5gKFWK4Xq6CFmAefQ"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col">
            <span className="font-headline-sm text-headline-sm font-bold text-primary tracking-tight leading-tight">
              KisanSathi
            </span>
            <span className="font-label-sm text-[12px] font-semibold text-secondary leading-tight">
              Smart Crop Advisory Assistant
            </span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden xl:flex items-center gap-1 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/20">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`font-label-md text-label-md px-4 py-2 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-container text-on-primary font-bold shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/60'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2.5">
          {/* Dark Mode Toggle */}
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="min-w-[44px] min-h-[44px] p-2 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors flex items-center justify-center"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* Helpline Call Button */}
          <a
            className="hidden sm:inline-flex items-center gap-1.5 bg-secondary-container/20 text-on-secondary-container px-3.5 py-2 min-h-[44px] rounded-full font-label-sm text-label-sm hover:bg-secondary-container/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
            href="tel:18001801551"
            title="Kisan Call Centre Helpline"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">support_agent</span>
            <span className="font-semibold">1800-180-1551</span>
          </a>

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="xl:hidden min-w-[44px] min-h-[44px] p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors flex items-center justify-center"
            type="button"
          >
            <span className="material-symbols-outlined text-2xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden bg-surface-container-lowest border-b border-outline-variant/30 px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 gap-1">
            {navItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl font-label-md text-label-md transition-colors ${
                    isActive
                      ? 'bg-primary-container text-on-primary font-bold'
                      : 'text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-end">
            <a
              href="tel:18001801551"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-secondary-container/20 text-on-secondary-container font-label-sm text-label-sm font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">support_agent</span>
              <span>1800-180-1551</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
};
