import React, { useEffect, useState } from 'react';
import { ActiveVoiceCall } from '../types';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  Radio,
  X
} from 'lucide-react';

interface InWebsiteCallOverlayProps {
  call: ActiveVoiceCall | null;
  micMuted: boolean;
  speakerMuted: boolean;
  audioLevel: number;
  onAccept: () => void;
  onDecline: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onDismissEnded: () => void;
}

export const InWebsiteCallOverlay: React.FC<InWebsiteCallOverlayProps> = ({
  call,
  micMuted,
  speakerMuted,
  audioLevel,
  onAccept,
  onDecline,
  onEnd,
  onToggleMic,
  onToggleSpeaker,
  onDismissEnded
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!call || call.status !== 'connected' || !call.startedAt) {
      setElapsedSec(0);
      return;
    }
    const updateTimer = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - call.startedAt!) / 1000)));
    };
    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [call?.callId, call?.status, call?.startedAt]);

  if (!call || call.status === 'idle') return null;

  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');
  const initials = (call.peerUsername || 'W')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const barMultipliers = [0.45, 0.85, 1.0, 0.75, 0.5];

  // Incoming Ringing Call Notification Card
  if (call.status === 'ringing_in') {
    return (
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[750] w-[calc(100%-1.5rem)] max-w-md rounded-3xl border-2 border-emerald-400 bg-gradient-to-br from-[#0b1f33]/98 via-[#0d273f]/98 to-[#071525]/98 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-white animate-fadeIn">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>Incoming WayGo Voice Call</span>
          </div>
          <span className="text-[10px] text-cyan-300 font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> No Phone Number
          </span>
        </div>

        <div className="flex items-center gap-3.5 mb-4">
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-lg font-black text-white shadow-lg shrink-0">
            <span className="absolute inset-0 rounded-2xl border-2 border-emerald-300 animate-ping opacity-50" />
            <span>{initials}</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-white truncate">{call.peerUsername}</h3>
            {call.peerEmail && (
              <p className="text-xs text-cyan-200/80 truncate">{call.peerEmail}</p>
            )}
            <p className="text-[11px] text-slate-300 mt-0.5">
              Linked carpool partner is calling you directly in WayGo...
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/30 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Phone className="w-4 h-4" />
            <span>Answer Voice Call</span>
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-3 rounded-2xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/40 text-rose-200 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Decline</span>
          </button>
        </div>
      </div>
    );
  }

  // Active / Calling / Connecting / Ended Call Card
  return (
    <div className="fixed bottom-5 right-5 z-[750] w-[calc(100%-2.5rem)] sm:w-[340px] rounded-3xl border border-cyan-400/35 bg-gradient-to-br from-[#0b192d]/98 via-[#0e223a]/98 to-[#071322]/98 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-white animate-fadeIn">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[10px] font-bold">
          <ShieldCheck className="w-3 h-3" />
          <span>In-Website Voice • Private</span>
        </div>
        {(call.status === 'ended' || call.status === 'error') && (
          <button
            type="button"
            onClick={onDismissEnded}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 cursor-pointer"
            aria-label="Dismiss call panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3.5 mb-4">
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500/80 to-cyan-500/80 border border-white/20 flex items-center justify-center text-base font-black text-white shrink-0">
          {call.status === 'calling' && (
            <span className="absolute inset-0 rounded-2xl border border-cyan-300 animate-ping opacity-60" />
          )}
          <span>{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-base text-white truncate">{call.peerUsername}</div>
          {call.peerEmail && (
            <div className="text-[11px] text-cyan-200/75 truncate">{call.peerEmail}</div>
          )}
          <div className="text-xs font-semibold mt-0.5 flex items-center gap-1.5">
            {call.status === 'calling' && (
              <span className="text-amber-300">Ringing partner in WayGo...</span>
            )}
            {call.status === 'connecting' && (
              <span className="text-cyan-300">Connecting encrypted browser audio...</span>
            )}
            {call.status === 'connected' && (
              <span className="text-emerald-400 font-mono">
                ● Live Audio • {mins}:{secs}
              </span>
            )}
            {call.status === 'ended' && (
              <span className="text-slate-300">{call.errorMessage || 'Call ended'}</span>
            )}
            {call.status === 'error' && (
              <span className="text-rose-300">{call.errorMessage || 'Unable to connect audio'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Live Voice Activity Waveform */}
      {(call.status === 'connected' || call.status === 'calling' || call.status === 'connecting') && (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-white/5 border border-white/10 mb-4">
          <span className="text-[11px] text-slate-300">
            {micMuted
              ? 'Microphone muted'
              : call.status === 'connected'
              ? 'WebRTC peer audio active'
              : 'Waiting for partner audio...'}
          </span>
          <div className="flex items-end gap-1 h-5">
            {barMultipliers.map((mult, idx) => {
              const pct = micMuted
                ? 15
                : call.status === 'connected'
                ? Math.min(100, Math.max(18, Math.round(audioLevel * mult * 100)))
                : 25;
              return (
                <span
                  key={idx}
                  style={{ height: `${pct}%` }}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    micMuted ? 'bg-slate-500' : 'bg-emerald-400'
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      {call.status !== 'ended' && call.status !== 'error' ? (
        <div className="flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onToggleMic}
            className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              micMuted
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
                : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
            }`}
          >
            {micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{micMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleSpeaker}
            className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              speakerMuted
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
                : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
            }`}
            title={speakerMuted ? 'Unmute Partner Audio' : 'Mute Partner Audio'}
          >
            {speakerMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onEnd}
            className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>End Call</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onDismissEnded}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white transition cursor-pointer"
        >
          Close
        </button>
      )}
    </div>
  );
};
