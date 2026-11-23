import React from 'react';
import { User } from '../types';
import { CheckCircle2 } from 'lucide-react';

interface ProfilePanelProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onEditProfile: () => void;
  onLogout: () => void;
  onClearAccount: () => void;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({
  isOpen,
  user,
  onClose,
  onEditProfile,
  onLogout,
  onClearAccount
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed top-[88px] right-6 z-[150] w-[310px] p-6 rounded-3xl border border-white/20 bg-gray-900/90 backdrop-blur-2xl shadow-2xl text-white animate-fadeIn">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold font-serif">Your Profile</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/50 hover:text-white transition cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 border-2 border-white/30 flex items-center justify-center text-3xl shadow-lg">
            👤
          </div>
          <button
            type="button"
            onClick={() => alert('Profile picture upload coming soon!')}
            className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-white text-gray-900 flex items-center justify-center text-xs shadow-md cursor-pointer"
          >
            📷
          </button>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-3 text-xs mb-5">
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
          <span className="block text-white/50 text-[10px] uppercase">Username</span>
          <strong className="text-white text-sm">{user?.username || '—'}</strong>
        </div>

        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-white/50 text-[10px] uppercase">Email Address</span>
            {user?.emailVerified && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          <strong className="text-white text-sm break-all">{user?.email || '—'}</strong>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onEditProfile}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500/40 to-teal-500/40 hover:bg-white/15 border border-white/20 text-xs font-semibold transition cursor-pointer"
        >
          ✏️ Edit Profile
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full py-2.5 rounded-xl bg-white text-gray-950 hover:bg-white/90 text-xs font-bold transition cursor-pointer"
        >
          Logout
        </button>
        <button
          type="button"
          onClick={onClearAccount}
          className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white/70 transition cursor-pointer"
        >
          Clear Saved Account
        </button>
      </div>
    </div>
  );
};
