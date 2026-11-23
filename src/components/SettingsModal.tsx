import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { supabase } from '../supabaseClient';
import { getUserData, setUserData } from '../userData';

interface SettingsModalProps {
  isOpen: boolean;
  currentUser: User | null;
  onClose: () => void;
  onUpdateUser: (updated: Partial<User>) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onUpdateUser,
  onLogout,
  onDeleteAccount
}) => {
  const [pushNotifs, setPushNotifs] = useState(true);
  const [scheduleNotifs, setScheduleNotifs] = useState(true);
  const [poolNotifs, setPoolNotifs] = useState(true);
  const [profileVis, setProfileVis] = useState('everyone');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyEmail, setEmergencyEmail] = useState('');

  useEffect(() => {
    if (isOpen && currentUser?.id) getUserData<any>(currentUser.id, 'settings').then((s) => {
      setPushNotifs(s?.pushNotifs ?? true); setScheduleNotifs(s?.scheduleNotifs ?? true);
      setPoolNotifs(s?.poolNotifs ?? true); setProfileVis(s?.profileVis || 'everyone');
      setEmergencyName(s?.emergencyName || ''); setEmergencyEmail(s?.emergencyEmail || '');
    }).catch((err) => console.error('Could not load settings:', err));
  }, [isOpen, currentUser?.id]);

  if (!isOpen) return null;

  const handleEditProfile = async () => {
    const newUsername = prompt('Enter your new username:', currentUser?.username || '');
    if (newUsername === null) return;
    if (newUsername.trim().length < 2) {
      alert('Username must be at least 2 characters.');
      return;
    }
    const newEmail = prompt('Enter your new email address:', currentUser?.email || '');
    if (newEmail === null) return;
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      alert('Please enter a valid email address.');
      return;
    }
    const { data, error } = await supabase.auth.updateUser({
      email: cleanEmail,
      data: { username: newUsername.trim() },
    });
    if (error) { alert(error.message); return; }
    onUpdateUser({ username: newUsername.trim(), email: data.user.email || currentUser?.email || cleanEmail });
    alert('Profile updated successfully!');
  };

  const handleChangePassword = async () => {
    const newPass = prompt('Enter new password:');
    if (newPass === null) return;
    if (newPass.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    const confirmPass = prompt('Confirm new password:');
    if (confirmPass === null) return;
    if (newPass !== confirmPass) {
      alert('Passwords do not match.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) alert(error.message); else alert('Password updated successfully.');
  };

  const saveSettings = (patch: Record<string, unknown>) => {
    if (!currentUser?.id) return;
    getUserData<Record<string, unknown>>(currentUser.id, 'settings')
      .then((s) => setUserData(currentUser.id!, 'settings', { ...s, ...patch }))
      .catch((err) => alert(`Could not save settings: ${err.message}`));
  };

  const handleSaveEmergency = () => {
    if (!emergencyName.trim()) {
      alert('Please enter emergency contact name.');
      return;
    }
    const cleanEmail = emergencyEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      alert('Please enter a valid emergency contact email address.');
      return;
    }
    saveSettings({ emergencyName: emergencyName.trim(), emergencyEmail: cleanEmail });
    alert('Emergency contact saved successfully.');
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[650px] max-h-[88vh] overflow-y-auto p-7 rounded-3xl border border-white/20 bg-gradient-to-br from-[#122438]/95 to-[#0b1726]/95 backdrop-blur-2xl shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="font-serif text-2xl font-bold">Settings</h2>
            <p className="text-xs text-white/60">Manage your WayGo account, privacy, alerts and safety.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Section: Account */}
        <div className="p-4 rounded-2xl border border-white/10 bg-white/5 mb-4">
          <div className="text-sm font-bold mb-3 flex items-center gap-2">
            <span className="text-cyan-400">👤</span> Account Details
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div>
              <div className="text-xs font-semibold">Edit Profile</div>
              <div className="text-[11px] text-white/50">Change your username and email address.</div>
            </div>
            <button
              type="button"
              onClick={handleEditProfile}
              className="px-3.5 py-1.5 rounded-lg border border-white/20 bg-gradient-to-r from-emerald-500/40 to-teal-500/40 hover:bg-white/20 text-xs font-semibold transition cursor-pointer"
            >
              Edit Profile
            </button>
          </div>

          <div className="flex items-center justify-between py-2 pt-3">
            <div>
              <div className="text-xs font-semibold">Password</div>
              <div className="text-[11px] text-white/50">Change your WayGo password.</div>
            </div>
            <button
              type="button"
              onClick={handleChangePassword}
              className="px-3.5 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-semibold transition cursor-pointer"
            >
              Change Password
            </button>
          </div>
        </div>

        {/* Section: Notifications */}
        <div className="p-4 rounded-2xl border border-white/10 bg-white/5 mb-4">
          <div className="text-sm font-bold mb-3 flex items-center gap-2">
            <span className="text-cyan-400">🔔</span> Notifications
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div>
              <div className="text-xs font-semibold">Push Notifications</div>
              <div className="text-[11px] text-white/50">Receive general WayGo ride updates.</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={pushNotifs}
                onChange={(e) => {
                  setPushNotifs(e.target.checked);
                  saveSettings({ pushNotifs: e.target.checked });
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div>
              <div className="text-xs font-semibold">Schedule Reminders</div>
              <div className="text-[11px] text-white/50">Alerts based on your weekly timetable.</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleNotifs}
                onChange={(e) => {
                  setScheduleNotifs(e.target.checked);
                  saveSettings({ scheduleNotifs: e.target.checked });
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2 pt-3">
            <div>
              <div className="text-xs font-semibold">Vehicle Pooling Alerts</div>
              <div className="text-[11px] text-white/50">Notifications about new riders nearby.</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={poolNotifs}
                onChange={(e) => {
                  setPoolNotifs(e.target.checked);
                  saveSettings({ poolNotifs: e.target.checked });
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        {/* Section: Privacy */}
        <div className="p-4 rounded-2xl border border-white/10 bg-white/5 mb-4">
          <div className="text-sm font-bold mb-3 flex items-center gap-2">
            <span className="text-cyan-400">🔒</span> Privacy & Safety
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-xs font-semibold">Profile Visibility</div>
              <div className="text-[11px] text-white/50">Who can see your profile details.</div>
            </div>
            <select
              value={profileVis}
              onChange={(e) => {
                setProfileVis(e.target.value);
                saveSettings({ profileVis: e.target.value });
              }}
              className="px-3 py-1.5 rounded-lg bg-gray-900 border border-white/20 text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="everyone">Everyone</option>
              <option value="contacts">Contacts Only</option>
              <option value="private">Only Me</option>
            </select>
          </div>
        </div>

        {/* Section: Emergency Contact */}
        <div className="p-4 rounded-2xl border border-white/10 bg-white/5 mb-4">
          <div className="text-sm font-bold mb-1 flex items-center gap-2">
            <span className="text-cyan-400">🛡️</span> Emergency Contact
          </div>
          <p className="text-[11px] text-white/50 mb-3">Add a trusted contact to notify in an emergency.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="text"
              value={emergencyName}
              placeholder="Contact Person Name"
              onChange={(e) => setEmergencyName(e.target.value)}
              className="h-10 px-3 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/40 focus:outline-none"
            />
            <input
              type="email"
              value={emergencyEmail}
              placeholder="Contact Email Address"
              onChange={(e) => setEmergencyEmail(e.target.value)}
              className="h-10 px-3 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder:text-white/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveEmergency}
              className="col-span-2 h-9 rounded-xl bg-emerald-600/40 hover:bg-emerald-600/60 border border-emerald-500/40 text-emerald-200 text-xs font-semibold transition cursor-pointer"
            >
              Save Emergency Contact
            </button>
          </div>
        </div>

        {/* Section: Actions */}
        <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5">
          <div className="text-sm font-bold text-rose-300 mb-3 flex items-center gap-2">
            <span>⚠️</span> Account Actions
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <div>
              <div className="text-xs font-semibold">Sign Out</div>
              <div className="text-[11px] text-white/50">Logout while keeping your saved data.</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-1.5 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 text-xs font-semibold transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>

          <div className="flex items-center justify-between py-2 pt-3">
            <div>
              <div className="text-xs font-semibold text-rose-300">Delete Account</div>
              <div className="text-[11px] text-white/50">Permanently erase your account and local data.</div>
            </div>
            <button
              type="button"
              onClick={onDeleteAccount}
              className="px-3.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold transition cursor-pointer"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
