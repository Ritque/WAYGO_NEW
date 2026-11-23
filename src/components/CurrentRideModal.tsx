import React from 'react';
import { RideBooking } from '../types';

interface CurrentRideModalProps {
  isOpen: boolean;
  currentRide: RideBooking | null;
  onClose: () => void;
  onRemoveRide: () => void;
  onOpenBooking: () => void;
}

export const CurrentRideModal: React.FC<CurrentRideModalProps> = ({
  isOpen,
  currentRide,
  onClose,
  onRemoveRide,
  onOpenBooking
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[530px] max-h-[90vh] overflow-y-auto rounded-3xl border border-white/20 bg-gradient-to-br from-[#182d40] to-[#0c192c] shadow-2xl p-6 text-white">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="font-serif text-2xl font-bold">My Current Ride</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white transition text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {!currentRide ? (
          <div>
            <p className="text-sm text-white/70 leading-relaxed mb-6">
              You have no active or saved ride right now. Choose a car or bike pooling ride to get started.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBooking();
                }}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-sm shadow-lg transition cursor-pointer"
              >
                Find a Ride →
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="inline-block px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold mb-4">
              {currentRide.status || 'Booking request saved'}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Booking Reference</span>
                <strong className="text-white text-sm font-mono">{currentRide.id}</strong>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Pooling Type</span>
                <strong className="text-white text-sm">{currentRide.typeLabel}</strong>
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Pickup</span>
                <strong className="text-white text-sm block leading-snug">{currentRide.pickup}</strong>
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Destination</span>
                <strong className="text-white text-sm block leading-snug">{currentRide.drop}</strong>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Route Distance</span>
                <strong className="text-white text-sm">{currentRide.distance}</strong>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Travel Time</span>
                <strong className="text-white text-sm">{currentRide.eta}</strong>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Estimated Fare</span>
                <strong className="text-emerald-400 text-sm font-bold">{currentRide.fare}</strong>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-white/50 text-[10px] uppercase mb-1">Requested At</span>
                <strong className="text-white text-sm">
                  {new Date(currentRide.bookedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </strong>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-white/50 mt-4">
              This demo stores your booking request and fare estimation. Fares shown are illustrative estimates based on route distance and local time.
            </p>

            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 font-bold text-xs transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onRemoveRide}
                className="flex-1 py-3 rounded-xl border border-rose-500/30 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs transition cursor-pointer"
              >
                Remove Saved Ride
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
