import React, { useState } from 'react';
import { PoolingMode, VehicleMode } from '../types';

interface PoolingSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: PoolingMode) => void;
}

export const PoolingSelectionModal: React.FC<PoolingSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectMode
}) => {
  const [step, setStep] = useState<'vehicle' | 'car'>('vehicle');

  if (!isOpen) return null;

  const handleSelectVehicle = (vehicle: VehicleMode) => {
    if (vehicle === 'bike') {
      onSelectMode('bike');
    } else {
      setStep('car');
    }
  };

  const handleSelectCarMode = (mode: 'private' | 'cab') => {
    onSelectMode(mode);
    setStep('vehicle');
  };

  return (
    <div
      className="fixed inset-0 z-[290] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setStep('vehicle');
          onClose();
        }
      }}
    >
      <div className="w-full max-w-[460px] rounded-3xl border border-white/20 bg-gradient-to-br from-[#122438]/95 to-[#0b1726]/95 backdrop-blur-2xl shadow-2xl text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 className="font-serif text-2xl font-bold">
              Choose how you&apos;re travelling
            </h2>
            <p className="text-xs text-white/60">
              Pick a pooling option to find riders heading your way.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setStep('vehicle');
              onClose();
            }}
            className="w-9 h-9 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition"
          >
            ✕
          </button>
        </div>

        {/* Step 1: Car vs Bike */}
        {step === 'vehicle' && (
          <div className="flex flex-col gap-3 p-6 pt-0">
            <button
              type="button"
              onClick={() => handleSelectVehicle('car')}
              className="flex items-center gap-3.5 w-full p-4 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/15 text-left transition group cursor-pointer"
            >
              <div className="text-3xl shrink-0">🚗</div>
              <div className="flex-1">
                <div className="text-sm font-bold mb-0.5 group-hover:text-cyan-300 transition">Car Pooling</div>
                <div className="text-xs text-white/55">Share a car ride with others heading your way.</div>
              </div>
              <div className="text-white/40 group-hover:text-white transition">→</div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectVehicle('bike')}
              className="flex items-center gap-3.5 w-full p-4 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/15 text-left transition group cursor-pointer"
            >
              <div className="text-3xl shrink-0">🏍️</div>
              <div className="flex-1">
                <div className="text-sm font-bold mb-0.5 group-hover:text-cyan-300 transition">Bike Pooling</div>
                <div className="text-xs text-white/55">Quick, low-cost rides on two wheels.</div>
              </div>
              <div className="text-white/40 group-hover:text-white transition">→</div>
            </button>
          </div>
        )}

        {/* Step 2: Private Car vs Cab */}
        {step === 'car' && (
          <div className="flex flex-col gap-3 p-6 pt-0">
            <button
              type="button"
              onClick={() => setStep('vehicle')}
              className="self-start text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition mb-1 cursor-pointer"
            >
              ← Back to vehicle choice
            </button>

            <button
              type="button"
              onClick={() => handleSelectCarMode('private')}
              className="flex items-center gap-3.5 w-full p-4 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/15 text-left transition group cursor-pointer"
            >
              <div className="text-3xl shrink-0">🚘</div>
              <div className="flex-1">
                <div className="text-sm font-bold mb-0.5 group-hover:text-cyan-300 transition">Private / Self Car Pooling</div>
                <div className="text-xs text-white/55">Share your own car, or ride along in a commuter&apos;s private car.</div>
              </div>
              <div className="text-white/40 group-hover:text-white transition">→</div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectCarMode('cab')}
              className="flex items-center gap-3.5 w-full p-4 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/15 text-left transition group cursor-pointer"
            >
              <div className="text-3xl shrink-0">🚕</div>
              <div className="flex-1">
                <div className="text-sm font-bold mb-0.5 group-hover:text-cyan-300 transition">Cab Pooling</div>
                <div className="text-xs text-white/55">Share a hired cab with other riders on a similar route.</div>
              </div>
              <div className="text-white/40 group-hover:text-white transition">→</div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
