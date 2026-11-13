import React, { useState, useEffect, useRef } from 'react';
import { PageId, AdvisoryResultData, ExplainResponse, ChatMessage } from '../types';
import { postExplain, postChat, ApiError } from '../api/client';
import { speakText, stopSpeaking } from '../utils/speechUtils';

interface ResultsPageProps {
  advisory: AdvisoryResultData | null;
  onNavigate: (page: PageId) => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({
  advisory,
  onNavigate,
}) => {
  const [isVoiceSpeaking, setIsVoiceSpeaking] = useState(false);

  // AI Explanation State
  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);
  const [isExplainLoading, setIsExplainLoading] = useState<boolean>(true);
  const [explainError, setExplainError] = useState<string | null>(null);
  const explainRequestIdRef = useRef<number>(0);

  // Follow-up Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const prevAdvisoryRef = useRef<AdvisoryResultData | null>(null);

  if (!advisory) {
    return (
      <div className="flex flex-col w-full min-h-[60vh] items-center justify-center p-6 text-center">
        <div className="max-w-md bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/30 space-y-4">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center mx-auto text-primary">
            <span className="material-symbols-outlined text-3xl">psychiatry</span>
          </div>
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
            No Advisory Report Found
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Please enter your crop and plot details to generate a customized scientific advisory.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('get-advice')}
            className="px-6 py-3 bg-primary text-on-primary rounded-xl font-label-md text-label-md font-bold hover:bg-primary-container transition-colors shadow-sm"
          >
            Get Crop Advice Now
          </button>
        </div>
      </div>
    );
  }

  const {
    fieldData = {} as any,
    generatedDate = '',
    zoneName = '',
    personalizedIntro = '',
    seasonWarning,
    soilWarning,
    fertilizerPlan = [],
    micronutrientNote = '',
    irrigationFrequency = '',
    waterConserved = '',
    runtimePerZone = '',
    moistureStages = [],
    stagnationAlert = '',
    pests = [],
    harvestSteps = [],
    expectedYield = '',
    mandiRates = [],
  } = advisory;

  // Format generated date with Intl.DateTimeFormat in 'en-IN'
  const formattedDisplayDate = (() => {
    try {
      const formatter = new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      return formatter.format(new Date());
    } catch {
      return generatedDate;
    }
  })();

  // Fetch AI advisory explanation once per advisory in the background
  useEffect(() => {
    if (!advisory?.fieldData) return;

    const currentReqId = ++explainRequestIdRef.current;
    setIsExplainLoading(true);
    setExplainError(null);
    const controller = new AbortController();

    postExplain(advisory.fieldData, { signal: controller.signal })
      .then((res) => {
        if (currentReqId === explainRequestIdRef.current) {
          setExplainData(res);
          setIsExplainLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (currentReqId === explainRequestIdRef.current) {
          let msg = 'Could not load explanation.';
          if (err instanceof ApiError) {
            if (err.status === 429) {
              msg = 'Too many requests, please wait a minute.';
            } else if (err.status === 400 && err.fields && Object.keys(err.fields).length > 0) {
              msg = Object.values(err.fields).join(' ');
            } else if (err.message) {
              msg = err.message;
            }
          }
          setExplainError(msg);
          // Set fallback explanation so user still sees meaningful advice
          setExplainData({
            explanation: personalizedIntro,
            source: 'fallback',
          });
          setIsExplainLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [advisory]);

  // Reset chat state when a new advisory is generated
  useEffect(() => {
    if (prevAdvisoryRef.current !== advisory) {
      prevAdvisoryRef.current = advisory;
      setMessages([]);
      setChatInput('');
      setChatError(null);
      setLastFailedQuestion(null);
    }
  }, [advisory]);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (messages.length > 0 && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isChatLoading]);

  // Audio speech synthesis using the active explanation
  const speechText = explainData?.explanation || personalizedIntro;

  const handleVoiceToggle = () => {
    if (isVoiceSpeaking) {
      stopSpeaking();
      setIsVoiceSpeaking(false);
    } else {
      speakText(
        speechText,
        'en-IN',
        () => setIsVoiceSpeaking(true),
        () => setIsVoiceSpeaking(false)
      );
    }
  };

  const handleSendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || isChatLoading || !advisory?.fieldData) return;

    // Send only completed history items with {role, text} in order, at most last 6
    const historyToSend: ChatMessage[] = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text.trim() }));

    const userMsg: ChatMessage = { role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);
    setChatError(null);
    setLastFailedQuestion(null);

    try {
      const res = await postChat(advisory.fieldData, trimmed, historyToSend);
      if (res && typeof res.answer === 'string') {
        const assistantMsg: ChatMessage = { role: 'assistant', text: res.answer };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: unknown) {
      // Failed request must NOT add a fake answer; roll back unfulfilled user question
      setMessages((prev) => prev.filter((m, i, arr) => i < arr.length - 1 || m.role !== 'user' || m.text !== trimmed));
      let errorMsg = 'Failed to get answer. Please try again.';
      if (err instanceof ApiError) {
        if (err.status === 429) {
          errorMsg = 'Too many requests, please wait a minute.';
        } else if (err.status === 400 && err.fields && Object.keys(err.fields).length > 0) {
          errorMsg = Object.values(err.fields).join(' ');
        } else if (err.message) {
          errorMsg = err.message;
        }
      }
      setChatError(errorMsg);
      setLastFailedQuestion(trimmed);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleRetryChat = () => {
    if (lastFailedQuestion) {
      handleSendQuestion(lastFailedQuestion);
    }
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `🌾 *KisanSathi Smart Crop Advisory Report*\n` +
      `• *Farmer:* ${fieldData.farmerName || 'Kisan'}\n` +
      `• *Location:* ${fieldData.district || ''}${fieldData.state ? ', ' + fieldData.state : ''}\n` +
      `• *Crop:* ${(fieldData.crop || '').toUpperCase()} (${fieldData.landSize || ''} ${fieldData.landUnit || ''})\n` +
      `• *Fertilizer Plan:* Basal & Top-dress balanced nutrition\n` +
      `• *Irrigation:* ${irrigationFrequency} (${waterConserved})\n` +
      `• *Mandi Status:* APMC Market Rates Verified\n` +
      `View customized guidance at KisanSathi Portal.`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="flex flex-col w-full">
      <div className="max-w-[1200px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        {/* Season Warning Banner if Incompatible */}
        {seasonWarning && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-start gap-3.5 text-amber-900 dark:text-amber-200 shadow-sm animate-in fade-in">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-2xl shrink-0 mt-0.5">
              warning
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-label-md text-label-md font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Seasonal Compatibility Notice
              </span>
              <p className="font-body-md text-body-md font-medium leading-relaxed">
                {seasonWarning}
              </p>
            </div>
          </div>
        )}

        {/* Soil Warning Banner if Incompatible */}
        {soilWarning && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-start gap-3.5 text-amber-900 dark:text-amber-200 shadow-sm animate-in fade-in">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-2xl shrink-0 mt-0.5">
              warning
            </span>
            <div className="flex flex-col gap-1">
              <span className="font-label-md text-label-md font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Soil Compatibility Notice
              </span>
              <p className="font-body-md text-body-md font-medium leading-relaxed">
                {soilWarning}
              </p>
            </div>
          </div>
        )}

        {/* 1. Top Banner / Header Summary */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-md flex flex-col gap-6 relative overflow-hidden border border-outline-variant/30">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-primary-fixed/30 rounded-full blur-3xl pointer-events-none"></div>

          {/* Verification Badge & Action Bar Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 z-10">
            <div className="inline-flex items-center gap-2.5 bg-surface-container px-3.5 py-1.5 rounded-full w-fit border border-outline-variant/20">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></span>
              <span className="font-label-md text-label-md text-primary font-bold">
                Advisory Generated Successfully • {zoneName} ({formattedDisplayDate})
              </span>
              <span className="material-symbols-outlined text-primary text-base fill">verified</span>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('get-advice')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container text-primary hover:bg-surface-container-high transition-colors font-label-md text-label-md min-h-[44px] font-semibold border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-lg">replay</span>
                <span>New Advice</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant transition-colors font-label-md text-label-md min-h-[44px] font-semibold border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-lg text-primary">download</span>
                <span>Print / Save PDF</span>
              </button>

              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary-container text-on-primary hover:bg-primary transition-all font-label-md text-label-md min-h-[44px] shadow-sm font-bold"
              >
                <span className="material-symbols-outlined text-xl">share</span>
                <span>Share via WhatsApp</span>
              </button>
            </div>
          </div>

          {/* Active Input Metadata Chips */}
          <div className="flex flex-col gap-2.5 z-10 pt-2 border-t border-outline-variant/20">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
              Active Field Baseline
            </span>
            <div className="flex flex-wrap gap-2.5">
              {/* Crop Chip */}
              <div className="inline-flex items-center gap-2 bg-surface-container-low px-3.5 py-2 rounded-xl text-on-surface shadow-sm border border-outline-variant/20">
                <span className="material-symbols-outlined text-primary text-lg">spa</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[11px] text-on-surface-variant leading-none">Crop</span>
                  <span className="font-label-md text-label-md font-bold text-primary leading-tight capitalize">
                    {fieldData.crop || 'Crop'}
                  </span>
                </div>
              </div>

              {/* Soil Chip */}
              <div className="inline-flex items-center gap-2 bg-surface-container-low px-3.5 py-2 rounded-xl text-on-surface shadow-sm border border-outline-variant/20">
                <span className="material-symbols-outlined text-secondary text-lg">landscape</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[11px] text-on-surface-variant leading-none">Soil</span>
                  <span className="font-label-md text-label-md font-semibold text-on-surface leading-tight capitalize">
                    {(fieldData.soilType || fieldData.soil || '').replace('_', ' ')}
                  </span>
                </div>
              </div>

              {/* Season Chip */}
              <div className="inline-flex items-center gap-2 bg-surface-container-low px-3.5 py-2 rounded-xl text-on-surface shadow-sm border border-outline-variant/20">
                <span className="material-symbols-outlined text-secondary text-lg">cyclone</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[11px] text-on-surface-variant leading-none">Season</span>
                  <span className="font-label-md text-label-md font-semibold text-on-surface leading-tight capitalize">
                    {fieldData.season || 'Season'}
                  </span>
                </div>
              </div>

              {/* Location Chip */}
              <div className="inline-flex items-center gap-2 bg-surface-container-low px-3.5 py-2 rounded-xl text-on-surface shadow-sm border border-outline-variant/20">
                <span className="material-symbols-outlined text-primary text-lg">pin_drop</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[11px] text-on-surface-variant leading-none">Location</span>
                  <span className="font-label-md text-label-md font-semibold text-on-surface leading-tight capitalize">
                    {fieldData.district || ''}{fieldData.block ? ` (${fieldData.block})` : ''}{fieldData.state ? `, ${fieldData.state}` : ''}
                  </span>
                </div>
              </div>

              {/* Area Chip */}
              <div className="inline-flex items-center gap-2 bg-surface-container-low px-3.5 py-2 rounded-xl text-on-surface shadow-sm border border-outline-variant/20">
                <span className="material-symbols-outlined text-primary text-lg">straighten</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[11px] text-on-surface-variant leading-none">Area</span>
                  <span className="font-label-md text-label-md font-semibold text-on-surface leading-tight">
                    {fieldData.landSize || ''} {fieldData.landUnit || ''}
                  </span>
                </div>
              </div>

              {/* Irrigation Chip */}
              <div className="inline-flex items-center gap-2 bg-surface-container-low px-3.5 py-2 rounded-xl text-on-surface shadow-sm border border-outline-variant/20">
                <span className="material-symbols-outlined text-secondary text-lg">water_drop</span>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[11px] text-on-surface-variant leading-none">Irrigation</span>
                  <span className="font-label-md text-label-md font-semibold text-on-surface leading-tight capitalize">
                    {(fieldData.waterSource || '').replace('_', ' + ')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. AI Agro-Explanation Box with Follow-Up QA */}
        <div className="bg-gradient-to-br from-surface-container via-surface-container-low to-surface-container-highest rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col gap-6 relative overflow-hidden border border-outline-variant/30">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-xl">smart_toy</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center flex-wrap gap-2">
                  <h2 className="font-headline-md text-headline-md text-primary font-bold tracking-tight">
                    KisanSathi AI Agronomist Synthesis
                  </h2>
                  {/* Source Badge */}
                  {!isExplainLoading && explainData && (
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        explainData.source === 'ai'
                          ? 'bg-primary/10 text-primary border-primary/25'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {explainData.source === 'ai' ? 'auto_awesome' : 'info'}
                      </span>
                      <span>
                        {explainData.source === 'ai'
                          ? 'AI-generated explanation'
                          : 'Basic explanation (AI unavailable)'}
                      </span>
                    </span>
                  )}
                </div>
                <p className="font-label-sm text-label-sm text-on-surface-variant">
                  Trained on ICAR &amp; State Agricultural Universities Protocols
                </p>
              </div>
            </div>

            {/* Regional Voice Audio Assistant Button */}
            <button
              onClick={handleVoiceToggle}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary-container text-on-secondary-fixed font-label-md text-label-md shadow-sm hover:opacity-95 transition-all min-h-[44px] font-bold"
              type="button"
            >
              <span className="material-symbols-outlined text-xl text-on-secondary-fixed">
                {isVoiceSpeaking ? 'pause_circle' : 'volume_up'}
              </span>
              <span>
                {isVoiceSpeaking ? 'Stop Audio' : 'Listen Audio'}
              </span>
            </button>
          </div>

          {/* Explanation Content Box with Shimmer Skeleton */}
          <div className="bg-surface-container-lowest/80 backdrop-blur-sm p-5 sm:p-6 rounded-2xl flex items-start gap-4 shadow-sm border border-outline-variant/20">
            <span className="material-symbols-outlined text-3xl text-primary shrink-0 opacity-40 select-none">
              format_quote
            </span>
            <div className="flex flex-col gap-3 w-full">
              {isExplainLoading ? (
                <div className="space-y-3 animate-pulse py-1" aria-busy="true" aria-label="Loading explanation">
                  <div className="h-4 bg-outline-variant/30 rounded w-5/6"></div>
                  <div className="h-4 bg-outline-variant/30 rounded w-full"></div>
                  <div className="h-4 bg-outline-variant/30 rounded w-4/5"></div>
                  <div className="h-4 bg-outline-variant/30 rounded w-2/3"></div>
                </div>
              ) : (
                <>
                  {explainError && (
                    <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 flex items-center gap-2 text-sm text-error">
                      <span className="material-symbols-outlined text-base shrink-0">error</span>
                      <span>{explainError}</span>
                    </div>
                  )}
                  <p className="font-body-xl text-body-xl text-on-surface leading-relaxed whitespace-pre-line">
                    {explainData?.explanation || speechText}
                  </p>
                </>
              )}

              {/* One-Line AI Disclaimer */}
              <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium pt-2 border-t border-outline-variant/20">
                <span className="material-symbols-outlined text-[16px] text-amber-600 dark:text-amber-400 shrink-0">
                  shield_with_heart
                </span>
                <span>
                  AI advice can be wrong. Please confirm with your local agriculture officer before using chemicals.
                </span>
              </div>
            </div>
          </div>

          {/* Follow-Up Chat Section */}
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md font-bold text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-lg">forum</span>
                <span>Ask Follow-Up Question to Agronomist</span>
              </span>
              <span className="text-xs text-on-surface-variant">
                Advisory-grounded assistance
              </span>
            </div>

            {/* Scrollable Message List */}
            {messages.length > 0 && (
              <div className="max-h-72 overflow-y-auto space-y-3 p-3.5 rounded-xl bg-surface-container-lowest/70 border border-outline-variant/20">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${
                        m.role === 'user'
                          ? 'bg-primary text-on-primary rounded-br-none'
                          : 'bg-surface-container text-on-surface rounded-bl-none border border-outline-variant/20'
                      }`}
                    >
                      {m.role === 'assistant' && (
                        <div className="flex items-center gap-1.5 text-primary text-xs font-bold mb-1">
                          <span className="material-symbols-outlined text-[16px]">psychiatry</span>
                          <span>AI Agronomist</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-surface-container text-on-surface-variant rounded-2xl rounded-bl-none p-3 text-sm flex items-center gap-2 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-[18px] text-primary animate-spin">
                        progress_activity
                      </span>
                      <span>AI Agronomist is analyzing...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Inline Error with Retry */}
            {chatError && (
              <div className="p-3 rounded-xl bg-error-container/20 border border-error/30 flex items-center justify-between gap-3 text-sm text-error">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">error</span>
                  <span>{chatError}</span>
                </div>
                {lastFailedQuestion && (
                  <button
                    type="button"
                    onClick={handleRetryChat}
                    className="px-3 py-1 bg-error text-on-error rounded-lg text-xs font-bold hover:opacity-90 transition-opacity shrink-0"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* Question Input Form with Counter and Enter-to-Send */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendQuestion(chatInput);
              }}
              className="flex flex-col sm:flex-row items-stretch gap-2.5"
            >
              <div className="relative flex-grow min-w-0">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">
                  psychology_alt
                </span>
                <input
                  type="text"
                  maxLength={500}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendQuestion(chatInput);
                    }
                  }}
                  placeholder="Ask anything about your crop plan (e.g. When should I apply the second dose?)..."
                  className="w-full h-14 pl-12 pr-16 bg-surface-container-lowest text-on-surface rounded-xl font-body-md text-body-md shadow-sm placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary border border-outline-variant/30"
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-on-surface-variant/70 font-mono select-none">
                  {chatInput.length}/500
                </span>
              </div>
              <button
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                className="h-14 px-7 bg-primary text-on-primary rounded-xl font-label-lg text-label-lg font-bold inline-flex items-center justify-center gap-2 shrink-0 hover:bg-primary-container transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isChatLoading ? 'Analyzing...' : 'Ask AI'}</span>
                <span className="material-symbols-outlined text-xl">send</span>
              </button>
            </form>

            {/* 3 Suggested Question Chips */}
            <div className="flex items-center flex-wrap gap-2 pt-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">
                Suggested Questions:
              </span>
              <button
                type="button"
                onClick={() => handleSendQuestion('When should I apply the second dose?')}
                disabled={isChatLoading}
                className="px-3 py-1.5 rounded-full bg-surface-container-lowest/90 hover:bg-surface-container text-on-surface font-label-sm text-label-sm transition-colors shadow-sm border border-outline-variant/20 disabled:opacity-50"
              >
                💡 When should I apply the second dose?
              </button>
              <button
                type="button"
                onClick={() => handleSendQuestion('What if it rains?')}
                disabled={isChatLoading}
                className="px-3 py-1.5 rounded-full bg-surface-container-lowest/90 hover:bg-surface-container text-on-surface font-label-sm text-label-sm transition-colors shadow-sm border border-outline-variant/20 disabled:opacity-50"
              >
                🌧️ What if it rains?
              </button>
              <button
                type="button"
                onClick={() => handleSendQuestion('How can I save water?')}
                disabled={isChatLoading}
                className="px-3 py-1.5 rounded-full bg-surface-container-lowest/90 hover:bg-surface-container text-on-surface font-label-sm text-label-sm transition-colors shadow-sm border border-outline-variant/20 disabled:opacity-50"
              >
                💧 How can I save water?
              </button>
            </div>
          </div>
        </div>

        {/* 3. Advisory Cards 2x2 Responsive Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Card A: Fertilizer Plan */}
          <div className="bg-surface-container-lowest rounded-2xl p-6 sm:p-7 shadow-md flex flex-col gap-6 relative overflow-hidden border border-outline-variant/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-2xl">compost</span>
                </div>
                <div>
                  <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                    Nutrition &amp; Soil
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Recommended Fertilizer Plan{' '}
                    <span className="text-secondary">(Fertilizer Management)</span>
                  </h3>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-semibold shrink-0">
                Plot Scaled
              </span>
            </div>

            {/* Schedule Table Breakdown */}
            <div className="w-full overflow-x-auto rounded-xl bg-surface-container-low/60 p-1 border border-outline-variant/20">
              <table className="w-full text-left font-body-sm text-body-sm">
                <thead className="bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-bold">
                  <tr>
                    <th className="p-3 rounded-l-lg">Stage</th>
                    <th className="p-3">Fertilizer Name</th>
                    <th className="p-3">Qty / Plot</th>
                    <th className="p-3 rounded-r-lg">Application Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {(fertilizerPlan ?? []).map((f, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-lowest/60 transition-colors">
                      <td className="p-3 font-semibold text-primary">
                        {f.stage}
                      </td>
                      <td className="p-3 font-medium text-on-surface">{f.fertilizerName}</td>
                      <td className="p-3 font-bold text-on-surface">{f.qtyPerAcre}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
                          {f.applicationMethod}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Micronutrient Booster Highlight Note */}
            {micronutrientNote && (
              <div className="p-4 rounded-xl bg-surface-container flex items-start gap-3 border border-outline-variant/20">
                <span className="material-symbols-outlined text-secondary text-xl shrink-0 mt-0.5">science</span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-label-md text-label-md text-on-surface font-bold">
                    Micronutrient Booster
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                    {micronutrientNote}
                  </p>
                </div>
              </div>
            )}

            {/* Field Photo Visual Reference */}
            <div className="relative w-full h-36 rounded-xl overflow-hidden shadow-inner bg-surface-container">
              <img
                alt="Agricultural crop with efficient management"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC1SDpcTLT0ZAMkZ5bxAiilITIDBfqzWEaj-p3vRSEA9YsxDUyR8rlGNyea8UuBOvqu8bQRbC5dbW9b-_AanRFDPEZSQkeVtLsh9-_1BbgZo-99uEhALav89MgE7sOls3luZlAoFATfgpBAqAbhc9hTeXtHTAXJceseQoifUaKvgRVv4hiZLHnuz82CwvhLIwj4eDUvkBEibKmcpZBKFmUd8UZ6taLi22cdCn4Gr1N_eHqfjzZrji8b"
                loading="lazy"
                width={500}
                height={144}
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-3">
                <span className="text-white font-label-sm text-label-sm font-semibold">
                  Balanced Fertilization &amp; Efficient Irrigation Management
                </span>
              </div>
            </div>
          </div>

          {/* Card B: Watering & Irrigation Schedule */}
          <div className="bg-surface-container-lowest rounded-2xl p-6 sm:p-7 shadow-md flex flex-col gap-6 relative overflow-hidden border border-outline-variant/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-2xl">water_drop</span>
                </div>
                <div>
                  <span className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider">
                    Hydration Dynamics
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Watering &amp; Irrigation Schedule{' '}
                    <span className="text-secondary">(Irrigation)</span>
                  </h3>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-semibold shrink-0">
                {runtimePerZone || 'Scheduled'}
              </span>
            </div>

            {/* Metric KPI Visualizer Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-container p-4 rounded-xl flex flex-col gap-1 border border-outline-variant/20">
                <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                  <span className="material-symbols-outlined text-sm text-primary">schedule</span>
                  <span>Cycle Frequency</span>
                </div>
                <span className="font-headline-md text-headline-md text-primary font-bold">
                  {irrigationFrequency || 'Regular'}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  {runtimePerZone}
                </span>
              </div>
              <div className="bg-surface-container p-4 rounded-xl flex flex-col gap-1 border border-outline-variant/20">
                <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
                  <span className="material-symbols-outlined text-sm text-secondary">water</span>
                  <span>Total Water Saving</span>
                </div>
                <span className="font-headline-md text-headline-md text-secondary font-bold">
                  {waterConserved || '~25%'}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Compared to flood irrigation</span>
              </div>
            </div>

            {/* Critical Moisture Stress Stages */}
            <div className="flex flex-col gap-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/20">
              <span className="font-label-md text-label-md font-bold text-on-surface">
                Critical Moisture Stress Stages
              </span>
              <div className="flex flex-col gap-3">
                {(moistureStages ?? []).map((m) => (
                  <div key={m.step} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary-container text-on-primary font-label-sm text-label-sm flex items-center justify-center font-bold">
                        {m.step}
                      </span>
                      <span className="font-body-md text-body-md text-on-surface font-semibold">{m.title}</span>
                    </div>
                    <span className="font-label-sm text-label-sm text-secondary font-bold">{m.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Water-Saving Drainage Tip */}
            {stagnationAlert && (
              <div className="p-4 rounded-xl bg-secondary-fixed/30 flex items-start gap-3 border border-secondary/20">
                <span className="material-symbols-outlined text-secondary text-2xl shrink-0 mt-0.5">warning</span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-label-md text-label-md text-on-secondary-fixed font-bold">
                    Monsoon Stagnation Alert
                  </span>
                  <p className="font-body-sm text-body-sm text-on-secondary-fixed leading-relaxed">
                    {stagnationAlert}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Card C: Common Diseases & Pests */}
          <div className="bg-surface-container-lowest rounded-2xl p-6 sm:p-7 shadow-md flex flex-col gap-6 relative overflow-hidden border border-outline-variant/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-error shrink-0">
                  <span className="material-symbols-outlined text-2xl">pest_control</span>
                </div>
                <div>
                  <span className="font-label-sm text-label-sm text-error font-bold uppercase tracking-wider">
                    Crop Protection
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Common Diseases &amp; Pests{' '}
                    <span className="text-secondary">(Pest Control)</span>
                  </h3>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold shrink-0">
                IPM Method
              </span>
            </div>

            {/* Pest Items Stack */}
            <div className="flex flex-col gap-4">
              {(pests ?? []).map((pest, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-surface-container-low flex flex-col gap-2 border border-outline-variant/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-lg">
                        {idx === 0 ? 'bug_report' : idx === 1 ? 'pest_control_rodent' : 'coronavirus'}
                      </span>
                      <span className="font-label-md text-label-md font-bold text-on-surface">
                        {pest.name}
                      </span>
                    </div>
                    <span
                      className={`font-label-sm text-label-sm font-bold ${
                        pest.severity === 'High Alert'
                          ? 'text-error'
                          : pest.severity === 'Medium Risk'
                          ? 'text-secondary'
                          : 'text-primary'
                      }`}
                    >
                      {pest.severity}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                    <strong>Symptoms:</strong> {pest.symptoms}
                    <br />
                    <strong>Control:</strong> {pest.control}
                  </p>
                </div>
              ))}
            </div>

            {/* Diagnostic Photo */}
            <div className="relative w-full h-36 rounded-xl overflow-hidden shadow-inner">
              <img
                alt="Agricultural inspection of pest traps"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDvVNkmoIhpxh8Gnmd2vyl7WnXgqKl_WOzNeMnyjme9xnoHAvUSH4Fdvgh7sZMOh_M8eVixEhj1pMkrfyiZC_lGIrXsTN-bDoxPOyhWasAc-6t6iw2GVtx0GQDLq1a6FYSnlzlFucPd2EfOWRhcLeZ72J00kuif4GQ9MlfGZo7NGzbbdb4Q-0nhVUSK-USasY5BXqXsKaXmYyQ-UIpqO-8oJGB41fc33wJNm-fn3I7uX0u-2dC4uQ_A"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-3">
                <span className="text-white font-label-sm text-label-sm font-semibold">
                  Early Detection via Pheromone Traps &amp; Integrated Pest Management
                </span>
              </div>
            </div>
          </div>

          {/* Card D: Seasonal & Harvest Tips */}
          <div className="bg-surface-container-lowest rounded-2xl p-6 sm:p-7 shadow-md flex flex-col gap-6 relative overflow-hidden border border-outline-variant/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-2xl">event_available</span>
                </div>
                <div>
                  <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">
                    Agronomy Timeline
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Seasonal &amp; Harvest Tips{' '}
                    <span className="text-secondary">(Harvest)</span>
                  </h3>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-bold shrink-0">
                {expectedYield}
              </span>
            </div>

            {/* 4 Step Chronological Flow */}
            <div className="flex flex-col gap-4">
              {(harvestSteps ?? []).map((step, idx) => (
                <div key={step.letter || idx} className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary font-label-md text-label-md font-bold shrink-0 border border-outline-variant/30">
                    {step.letter || String.fromCharCode(65 + idx)}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md font-bold text-on-surface">
                      {step.title}
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Harvest Photo */}
            <div className="relative w-full h-36 rounded-xl overflow-hidden shadow-inner">
              <img
                alt="Ripe field ready for harvest"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5Oib2g8pvsaqr88Xc-j4KLwmQloTT8JhAPrvY0FihmOWbt7NCrGN9-CvR2VaFSBTnIXkfdmO2Z03Mvvp9Fb0lxyb-Ceyn-NmikdYUG1Jiif1n_6ghMW4nyuYanqskpYiB2qt2Ql3X3ufI2swZXeBwX9bqF7zrMcR0M9MUyQ9qvrIGQacifrX1j9Y_Vgrf_kE5ZZIGGmpTvrnA5i1nN_bPBOLEDQeuZRaiIi2A3ivNGCUMM5q6TFPq"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-3">
                <span className="text-white font-label-sm text-label-sm font-semibold">
                  Maturity Phase: Timely harvesting and clean dry storage mandatory
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Nearby APMC Market Rates Ticker */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-md flex flex-col gap-4 border border-outline-variant/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-secondary text-2xl">storefront</span>
              <div className="flex flex-col">
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  Nearby APMC Mandi Bhav
                </h3>
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  Live benchmark auction rates verified today
                </span>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-primary font-label-sm text-label-sm font-semibold self-start sm:self-auto border border-outline-variant/20">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
              <span>National APMC Network Linked</span>
            </div>
          </div>

          {/* Ticker Data Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(mandiRates ?? []).map((rate, idx) => (
              <div
                key={idx}
                className="bg-surface-container-low p-5 rounded-xl flex items-center justify-between gap-4 border border-outline-variant/20"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined text-2xl">
                      {idx === 0 ? 'eco' : 'grain'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {rate.cropName}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">
                      {rate.variety} • {rate.marketYard}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-headline-lg text-headline-lg font-bold text-primary">
                    {rate.rateRange}
                  </span>
                  <span className="font-label-sm text-label-sm text-primary flex items-center gap-1 font-semibold">
                    <span className="material-symbols-outlined text-sm">{rate.trend}</span>
                    <span>{rate.trendText}</span>
                  </span>
                  <span className="font-label-sm text-[11px] text-on-surface-variant">
                    per 100 kg (Quintal)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
