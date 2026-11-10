import React, { useState } from 'react';
import { PageId } from '../types';

interface AboutPageProps {
  onNavigate: (page: PageId) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: 'How are fertilizer dosage recommendations calculated?',
      a: 'Recommendations are calibrated according to standardized Packages of Practices published by ICAR and state agricultural research institutes. The engine dynamically adjusts nitrogen, phosphorus, and potassium ratios based on your soil texture, plot size in bigha or acres, and whether you apply via drip fertigation or soil broadcasting.',
    },
    {
      q: 'Is KisanSathi completely free for all farmers in India?',
      a: 'Yes. KisanSathi is an agricultural extension public advisory platform. All advisories, crop knowledge guides, disease warnings, and APMC mandi rates are 100% free of charge for Indian farmers.',
    },
    {
      q: 'How does the Kisan Call Centre (1800-180-1551) integration work?',
      a: 'Farmers can call toll-free from 6:00 AM to 10:00 PM every day to speak directly with qualified agronomists and subject-matter specialists in English and regional languages. You can quote your advisory reference number for plot-specific diagnosis.',
    },
    {
      q: 'What is the benefit of linking my Soil Health Card?',
      a: 'By inputting your soil electrical conductivity (EC), organic carbon percentage, and available micronutrients (Zinc, Boron, Iron), the advisory engine cuts down wasteful chemical fertilizer purchases by 20–30%, saving input costs significantly.',
    },
    {
      q: 'Can I access the advisory and speech guides in bright sunlight?',
      a: 'Yes! The KisanSathi design system uses high-contrast agricultural tokens with oversized 52px touch buttons, clear text, and one-tap voice reading ("Listen") so farmers can listen without reading small text in the field.',
    },
  ];

  const partners = [
    {
      name: 'Indian Agricultural Research Institute (ICAR-IARI)',
      role: 'National Cereals, Pulses & Crop Protocols',
      icon: 'school',
    },
    {
      name: 'Central Research Institute for Dryland Agriculture (CRIDA)',
      role: 'Dryland Farming & Climate Resilient Cropping',
      icon: 'science',
    },
    {
      name: 'Indian Institute of Soil Science (IISS)',
      role: 'Soil Health & Integrated Nutrient Management',
      icon: 'yard',
    },
    {
      name: 'National Institute of Plant Health Management (NIPHM)',
      role: 'Integrated Pest Management & Bio-control',
      icon: 'forest',
    },
  ];

  return (
    <div className="flex flex-col w-full">
      <div className="max-w-[1200px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Header Hero Banner */}
        <section className="bg-surface-container-lowest rounded-3xl p-8 sm:p-12 shadow-sm border border-outline-variant/30 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary-fixed/20 blur-3xl pointer-events-none"></div>

          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-surface-container px-3.5 py-1.5 rounded-full text-secondary font-label-sm text-label-sm font-bold uppercase tracking-wider border border-outline-variant/20">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>About KisanSathi • National Farmer Advisory Initiative</span>
            </div>
            <h1 className="font-display-lg text-display-lg text-on-surface font-bold tracking-tight">
              Bridging Laboratory Science with{' '}
              <span className="text-primary">Every Indian Farm Acre</span>
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
              KisanSathi empowers farmers across India by translating complex agronomic research into clear, actionable, and timely field advice. Built in collaboration with agricultural scientists and the Krishi Vigyan Kendra network.
            </p>
            <div className="pt-2 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => onNavigate('get-advice')}
                className="px-6 py-3.5 rounded-full bg-primary text-on-primary hover:bg-primary-container font-label-md text-label-md font-bold transition-all shadow-sm flex items-center gap-2"
              >
                <span>Get Crop Advisory Now</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('crop-library')}
                className="px-6 py-3.5 rounded-full bg-surface-container text-primary hover:bg-surface-container-high font-label-md text-label-md font-bold transition-colors border border-outline-variant/30 flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[20px]">menu_book</span>
                <span>Explore Crop Library</span>
              </button>
            </div>
          </div>
        </section>

        {/* 3 Core Pillars */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-7 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex flex-col gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">science</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Scientific Precision
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              No guesswork. Sowing dates, seed treatments, and split fertilizer schedules match validated ICAR and state university agronomy benchmarks.
            </p>
          </div>

          <div className="p-7 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex flex-col gap-3">
            <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">water_drop</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Micro-Irrigation First
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Custom-calibrated for widespread drip and sprinkler systems (PMKSY standards) to conserve up to 42% water while preventing root-rot.
            </p>
          </div>

          <div className="p-7 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-sm flex flex-col gap-3">
            <div className="w-12 h-12 rounded-xl bg-tertiary-container text-on-tertiary flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">record_voice_over</span>
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Audio &amp; Field Accessibility
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Designed for outdoor field use with large touch targets, high-contrast English text, and one-tap voice reading ("Listen") for hands-free audio.
            </p>
          </div>
        </section>

        {/* Institutional Academic Network */}
        <section className="bg-surface-container-low rounded-3xl p-8 sm:p-10 border border-outline-variant/30 space-y-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
              Academic Alliances
            </span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">
              National Agricultural Research Network
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              KisanSathi's algorithmic advisory is grounded in research protocols published by India's premier agricultural institutions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {partners.map((p, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-surface-container-lowest border border-outline-variant/20 shadow-sm flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-xl bg-surface-container text-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">{p.icon}</span>
                </div>
                <div>
                  <h4 className="font-label-lg text-label-lg font-bold text-on-surface">
                    {p.name}
                  </h4>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {p.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive FAQ Section */}
        <section className="bg-surface-container-lowest rounded-3xl p-8 sm:p-10 border border-outline-variant/30 space-y-6">
          <div>
            <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
              Got Questions?
            </span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold mt-1">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="divide-y divide-outline-variant/20">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={index} className="py-4">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full flex items-center justify-between gap-4 text-left font-headline-sm text-headline-sm text-on-surface hover:text-primary transition-colors py-1"
                  >
                    <div>
                      <span className="font-bold">{faq.q}</span>
                    </div>
                    <span className="material-symbols-outlined text-2xl shrink-0 text-on-surface-variant">
                      {isOpen ? 'remove' : 'add'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="mt-3 p-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-body-md leading-relaxed animate-in fade-in duration-200">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact Banner */}
        <section className="bg-primary-container text-on-primary rounded-3xl p-8 sm:p-10 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="font-headline-lg text-headline-lg font-bold text-white">
              Need Personalized Agronomist Consultation?
            </h3>
            <p className="font-body-md text-body-md text-on-primary-container max-w-xl">
              Connect directly with our regional extension experts or visit your nearest Krishi Vigyan Kendra (KVK) office across India.
            </p>
          </div>
          <a
            href="tel:18001801551"
            className="shrink-0 px-7 py-4 rounded-full bg-secondary-container text-on-secondary-fixed font-label-lg text-label-lg font-bold shadow-md hover:bg-secondary-fixed transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-2xl">call</span>
            <span>1800-180-1551 Toll-Free</span>
          </a>
        </section>
      </div>
    </div>
  );
};
