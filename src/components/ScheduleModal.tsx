import React, { useState, useEffect } from 'react';
import { getUserData, setUserData, deleteUserData } from '../userData';

interface ScheduleModalProps {
  isOpen: boolean;
  userId?: string;
  onClose: () => void;
}

const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMETABLE_SLOTS = [
  '8:30 - 9:30',
  '9:30 - 10:30',
  '10:30 - 11:30',
  '11:30 - 12:30',
  '12:30 - 1:30',
  '1:30 - 2:30',
  '2:30 - 3:30',
  '3:30 - 4:30',
  '4:30 - 5:30',
  '5:30 - 6:30'
];

export const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, userId, onClose }) => {
  const [data, setData] = useState<Record<string, string>>({});
  const [showSavedToast, setShowSavedToast] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (!userId) { setData({}); return; }
      getUserData<Record<string, string>>(userId, 'timetable').then((saved) => setData(saved || {})).catch((err) => alert(`Could not load timetable: ${err.message}`));
    }
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const key = `${rowIndex}_${colIndex}`;
    setData((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    try {
      if (!userId) throw new Error('Sign in to save your timetable.');
      await setUserData(userId, 'timetable', data);
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 2000);
    } catch (err: any) {
      alert(`Failed to save timetable: ${err.message}`);
    }
  };

  const handleClear = async () => {
    if (confirm('Clear your entire timetable?')) {
      if (!userId) return;
      try {
        await deleteUserData(userId, 'timetable');
        setData({});
        setShowSavedToast(true);
        setTimeout(() => setShowSavedToast(false), 2000);
      } catch (err: any) {
        alert(`Could not clear timetable: ${err.message}`);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[900px] max-h-[88vh] overflow-y-auto p-7 rounded-3xl border border-white/20 bg-gradient-to-br from-[#122438]/95 to-[#0b1726]/95 backdrop-blur-2xl shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-serif text-2xl font-bold">Add Schedule — Weekly Timetable</h2>
            <p className="text-xs text-white/60">Fill in your daily commitments from 8:30 AM to 6:30 PM.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Timetable Table */}
        <div className="w-full overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="bg-[#141b2c] border-b border-white/15">
                <th className="p-3.5 px-4 text-xs font-semibold text-white/85">Time</th>
                {TIMETABLE_DAYS.map((day) => (
                  <th key={day} className="p-3.5 text-xs font-semibold text-white/85 text-center">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIMETABLE_SLOTS.map((slot, rowIndex) => (
                <tr key={slot} className="border-b border-white/5 last:border-b-0 hover:bg-white/5 transition">
                  <td className="p-3 px-4 text-xs whitespace-nowrap text-white/70 font-mono">{slot}</td>
                  {TIMETABLE_DAYS.map((_, colIndex) => {
                    const key = `${rowIndex}_${colIndex}`;
                    return (
                      <td key={colIndex} className="p-1.5 border-l border-white/5">
                        <input
                          type="text"
                          value={data[key] || ''}
                          placeholder="—"
                          onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                          className="w-full min-w-[95px] p-2 bg-transparent text-center text-xs text-white placeholder:text-white/25 focus:bg-cyan-500/15 focus:outline-none rounded-lg transition"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs shadow-lg transition cursor-pointer"
          >
            ✓ Save Timetable
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition cursor-pointer"
          >
            Clear All
          </button>
        </div>

        {/* Notification */}
        {showSavedToast && (
          <div className="mt-3 text-center text-xs text-cyan-300 font-semibold animate-pulse">
            Timetable updated successfully!
          </div>
        )}
      </div>
    </div>
  );
};
