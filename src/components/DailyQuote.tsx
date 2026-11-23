import React, { useState, useEffect } from 'react';
import { getNextMotivatingQuote, MotivatingQuote } from '../data/motivatingQuotes';

export const DailyQuote: React.FC = () => {
  const [quote, setQuote] = useState<MotivatingQuote | null>(null);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Fresh non-repeating authentic quote on every refresh / reopen
    const initialQuote = getNextMotivatingQuote(true);
    setQuote(initialQuote);
  }, []);

  const handleNextQuote = () => {
    setIsFading(true);
    setTimeout(() => {
      const nextQ = getNextMotivatingQuote(true);
      setQuote(nextQ);
      setIsFading(false);
    }, 180);
  };

  if (!quote) return null;

  return (
    <div className="w-full max-w-xl mx-auto mb-8 px-4 text-center select-none">
      <div
        className={`transition-all duration-200 transform ${
          isFading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
        }`}
      >
        <p className="text-base sm:text-lg md:text-xl italic font-normal text-white/95 leading-relaxed tracking-wide drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
          &ldquo;{quote.text}&rdquo;
        </p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-xs sm:text-sm font-semibold tracking-wider bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent drop-shadow-sm">
            &mdash; {quote.author}
          </span>
          <button
            type="button"
            onClick={handleNextQuote}
            title="Refresh for another quote"
            className="text-white/40 hover:text-emerald-300 hover:rotate-180 active:scale-95 transition-all duration-300 text-xs p-1 rounded cursor-pointer leading-none"
            aria-label="Refresh quote"
          >
            ↻
          </button>
        </div>
      </div>
    </div>
  );
};
