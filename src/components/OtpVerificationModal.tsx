import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, RefreshCw, X, CheckCircle, AlertCircle, Mail } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface OtpVerificationModalProps {
  isOpen: boolean;
  target: string;
  onClose: () => void;
  onVerified: (target: string) => void;
}

export const OtpVerificationModal: React.FC<OtpVerificationModalProps> = ({
  isOpen,
  target,
  onClose,
  onVerified
}) => {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [countdown, setCountdown] = useState(30);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isOpen && target) {
      setDigits(['', '', '', '', '', '', '', '']);
      setErrorMsg('');
      setSuccessMsg('');
      sendOtp();
    }
  }, [isOpen, target]);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const sendOtp = async () => {
    setSending(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: target.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setCountdown(30);
      setSuccessMsg(`Verification code sent to ${target.trim().toLowerCase()}! Please check your email inbox.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error sending OTP. Please try again.');
    } finally { setSending(false); }
  };
  /**
   * Only accept numeric digits (0-9). Blocks any non-digit character.
   */
  const handleChange = (index: number, value: string) => {
    // Strip everything that is not a numeric digit (0-9)
    const numericOnly = value.replace(/\D/g, '');

    if (!numericOnly && value.length > 0) {
      // User typed or inserted a non-numeric character - reject it
      return;
    }

    if (numericOnly.length > 1) {
      const pasted = numericOnly.slice(0, 8);
      const newDigits = [...digits];
      for (let i = 0; i < pasted.length; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      const nextIndex = Math.min(pasted.length, 7);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    const newDigits = [...digits];
    newDigits[index] = numericOnly;
    setDigits(newDigits);

    if (numericOnly && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  /**
   * KeyDown handler: strictly allows only digits (0-9) and standard editing keys.
   */
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allowed control & navigation keys
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'];
    if (allowedKeys.includes(e.key)) {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    // Allow keyboard shortcuts (Cmd+V, Ctrl+V, Cmd+C, etc.)
    if (e.ctrlKey || e.metaKey) {
      return;
    }

    // Validation logic: reject any key that is not a numeric digit (0-9)
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  /**
   * Clipboard paste handler: extracts numeric digits only.
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text') || '';
    const numericOnly = pastedText.replace(/\D/g, '').slice(0, 8);

    if (!numericOnly) {
      setErrorMsg('Pasted input must contain numeric digits (0-9).');
      return;
    }

    setErrorMsg('');
    const newDigits = [...digits];
    for (let i = 0; i < numericOnly.length; i++) {
      newDigits[i] = numericOnly[i];
    }
    setDigits(newDigits);
    const nextIdx = Math.min(numericOnly.length, 7);
    inputRefs.current[nextIdx]?.focus();
  };

  const handleVerify = async () => {
    const fullCode = digits.join('');

    // Supabase projects can use six or eight digit email tokens.
    if (!/^\d+$/.test(fullCode)) {
      setErrorMsg('Validation failed: OTP must contain only numeric digits (0-9).');
      return;
    }

    if (fullCode.length !== 6 && fullCode.length !== 8) {
      setErrorMsg('Enter the complete 6 or 8 digit code from your email.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const cleanEmail = target.trim().toLowerCase();

      let { error } = await supabase.auth.verifyOtp({
        email: cleanEmail, token: fullCode, type: 'email',
      });
      if (error) {
        const signupAttempt = await supabase.auth.verifyOtp({
          email: cleanEmail, token: fullCode, type: 'signup',
        });
        if (!signupAttempt.error) error = null;
      }
      if (error) {
        setErrorMsg(error.message || 'Incorrect verification code. Please check your email inbox.');
      } else {
        setSuccessMsg('Email verified successfully!');
        setTimeout(() => {
          onVerified(target);
          onClose();
        }, 700);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Verification failed. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-[#04060c]/80 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md p-6 rounded-3xl border border-white/20 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl shadow-2xl text-white relative overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold">
                Verify Email Address
              </h3>
              <p className="text-xs text-white/60">
            Check your email inbox for the verification code
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target display */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white/80 mb-3">
          <Mail className="w-4 h-4 text-cyan-400" />
          <span>Sent to:</span>
          <strong className="text-cyan-300 font-mono text-sm">{target}</strong>
        </div>

        {/* Check Email Notice Banner */}
        <div className="mb-4 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-start gap-2.5 text-xs text-cyan-200">
          <Mail className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            A numeric verification code has been sent to your email address. Please check your inbox (including spam/junk folder) and enter the code below.
          </p>
        </div>

        {/* 8 Digit Numeric Inputs */}
        <div className="flex justify-between gap-1.5 sm:gap-2 mb-4">
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onPaste={handlePaste}
              className="flex-1 min-w-0 h-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-xl bg-white/10 border border-white/20 focus:border-cyan-400 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 transition text-white"
            />
          ))}
        </div>

        {/* Status Messages */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs mb-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && !errorMsg && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs mb-3">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Action */}
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading || !/^\d{6}(?:\d{2})?$/.test(digits.join(''))}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Verifying code...</span>
            </>
          ) : (
            <span>Verify & Confirm</span>
          )}
        </button>

        {/* Resend */}
        <div className="flex items-center justify-between text-xs text-white/50 mt-4 pt-3 border-t border-white/10">
          <span>Didn&apos;t get the code?</span>
          {countdown > 0 ? (
            <span className="text-white/40">Resend in {countdown}s</span>
          ) : (
            <button
              type="button"
              onClick={sendOtp}
              disabled={sending}
              className="text-cyan-400 hover:text-cyan-300 font-semibold transition cursor-pointer"
            >
              {sending ? 'Sending...' : 'Resend 8-Digit OTP'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
