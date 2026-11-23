import React, { useState, useEffect } from 'react';
import { User, RealCommuter } from '../types';
import { carpoolFetch } from '../utils/carpoolApi';
import {
  LocationSource,
  calcDistanceMeters,
  formatPreciseDistance
} from '../utils/carpoolRealtime';
import { LocationStatus } from '../utils/locationManager';
import { 
  Radar, 
  UserCheck, 
  MapPin, 
  Mail, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  Navigation, 
  TrendingDown, 
  Sparkles,
  RefreshCw,
  X,
  Share2,
  Phone,
  Crosshair,
  XCircle
} from 'lucide-react';

interface CarpoolScannerModalProps {
  isOpen: boolean;
  currentUser: User | null;
  deviceId: string;
  pickupLocation: string;
  pickupCoords: { lat: number; lng: number };
  gpsAccuracyMeters?: number | null;
  calibratingGps?: boolean;
  locationSource: LocationSource;
  locationStatus?: LocationStatus;
  locationFixTimestamp?: number | null;
  locationError?: 'blocked' | 'unavailable' | null;
  onSetCustomLocation: (lat: number, lng: number, label: string) => void;
  locatingUser: boolean;
  onRefreshLocation: () => void;
  onCalibrateGps?: () => void;
  seekers: RealCommuter[];
  outOfRangeSeekers?: RealCommuter[];
  onRefreshNearby: () => void | Promise<void>;
  incomingRequest: any | null;
  onAcceptIncoming: () => void | Promise<void>;
  onDeclineIncoming: () => void | Promise<void>;
  activeSession: any | null;
  onSetActiveSession: (session: any | null) => void;
  onCancelLinkUp?: () => void | Promise<void>;
  onCancelPendingLinkUp?: () => void | Promise<void>;
  linkupNotice?: string | null;
  onDismissLinkupNotice?: () => void;
  pendingSentRequestId: string | null;
  onSetPendingSentRequestId: (id: string | null) => void;
  onBroadcastLinkUpRequest: (session: any) => void | Promise<void>;
  onCallPartner?: (partner: { deviceId: string; username: string; email?: string }) => void;
  isCallActive?: boolean;
  onClose: () => void;
}

export const CarpoolScannerModal: React.FC<CarpoolScannerModalProps> = ({
  isOpen,
  currentUser,
  deviceId,
  pickupLocation,
  pickupCoords,
  gpsAccuracyMeters = null,
  calibratingGps = false,
  locationSource,
  locationStatus = 'unavailable',
  locationFixTimestamp = null,
  locationError = null,
  onSetCustomLocation,
  locatingUser,
  onRefreshLocation,
  onCalibrateGps,
  seekers,
  outOfRangeSeekers = [],
  onRefreshNearby,
  incomingRequest,
  onAcceptIncoming,
  onDeclineIncoming,
  activeSession,
  onSetActiveSession,
  onCancelLinkUp,
  onCancelPendingLinkUp,
  linkupNotice = null,
  onDismissLinkupNotice,
  pendingSentRequestId,
  onSetPendingSentRequestId,
  onBroadcastLinkUpRequest,
  onCallPartner,
  isCallActive = false,
  onClose
}) => {
  const [scanning, setScanning] = useState(false);
  const [refreshingRadar, setRefreshingRadar] = useState(false);
  const [spawningTest, setSpawningTest] = useState(false);
  const [simulatingIncoming, setSimulatingIncoming] = useState(false);
  const [showAreaSearch, setShowAreaSearch] = useState(false);
  const [areaQuery, setAreaQuery] = useState('');
  const [areaResults, setAreaResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchingArea, setSearchingArea] = useState(false);
  const [localTestSeekers, setLocalTestSeekers] = useState<RealCommuter[]>([]);
  const [requestingSeekerId, setRequestingSeekerId] = useState<string | null>(null);
  const requestLockRef = React.useRef(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [bookingDialog, setBookingDialog] = useState<{
    provider: 'uber' | 'ola' | 'rapido';
    title: string;
    url: string;
    midpointName: string;
    destinationName: string;
    splitFare: number;
    gMapsUrl: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmCancelLinkUp, setConfirmCancelLinkUp] = useState(false);
  const [cancellingLinkUp, setCancellingLinkUp] = useState(false);

  // Strictly fixed destination
  const FIXED_DEST_NAME = 'MIT World Peace University (MIT-WPU), Kothrud, Pune';
  const FIXED_DEST_COORDS = { lat: 18.5178, lng: 73.8151 };

  const baseLat = pickupCoords.lat;
  const baseLng = pickupCoords.lng;

  // Merge server-detected commuters with any locally spawned test commuters (deduplicated by deviceId)
  const visibleSeekers: RealCommuter[] = React.useMemo(() => {
    const map = new Map<string, RealCommuter>();
    for (const s of localTestSeekers) {
      map.set(s.deviceId, s);
    }
    for (const s of seekers) {
      map.set(s.deviceId, s);
    }
    return Array.from(map.values()).sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);
  }, [seekers, localTestSeekers]);

  // Brief radar animation on open if no commuters/session are loaded yet, plus immediate refresh
  useEffect(() => {
    if (!isOpen) return;
    onRefreshNearby();
    if (visibleSeekers.length === 0 && !activeSession && !incomingRequest) {
      setScanning(true);
      const timer = setTimeout(() => setScanning(false), 650);
      return () => clearTimeout(timer);
    } else {
      setScanning(false);
    }
  }, [isOpen]);

  // Stop scanning immediately if commuters or an incoming request arrive
  useEffect(() => {
    if (visibleSeekers.length > 0 || incomingRequest || activeSession) {
      setScanning(false);
    }
  }, [visibleSeekers.length, incomingRequest, activeSession]);

  // Reset locally spawned test commuters whenever session deviceId or logged-in account changes
  useEffect(() => {
    setLocalTestSeekers([]);
  }, [deviceId, currentUser?.email]);

  // Clear cancel confirmation whenever active session or modal state changes
  useEffect(() => {
    setConfirmCancelLinkUp(false);
    setCancellingLinkUp(false);
  }, [activeSession?.id, isOpen]);

  // Clear local requesting spinner when pending request completes or is declined
  useEffect(() => {
    if (!pendingSentRequestId) {
      setRequestingSeekerId(null);
    }
  }, [pendingSentRequestId]);

  if (!isOpen) return null;

  const handleManualRadarRefresh = async () => {
    setRefreshingRadar(true);
    try {
      await onRefreshNearby();
    } finally {
      setTimeout(() => setRefreshingRadar(false), 300);
    }
  };

  const handleConfirmCancelSession = async () => {
    if (cancellingLinkUp) return;
    setCancellingLinkUp(true);
    try {
      if (onCancelLinkUp) {
        await onCancelLinkUp();
      } else {
        onSetActiveSession(null);
      }
    } finally {
      setCancellingLinkUp(false);
      setConfirmCancelLinkUp(false);
    }
  };

  const handleSearchArea = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = areaQuery.trim();
    if (!q) return;
    setSearchingArea(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=4&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setAreaResults(Array.isArray(data) ? data : []);
    } catch {
      setAreaResults([]);
    } finally {
      setSearchingArea(false);
    }
  };

  // Send real Link Up request to another real device (via both Express + Supabase Realtime Broadcast)
  const handleSendLinkUp = async (seeker: RealCommuter) => {
    if (requestLockRef.current || pendingSentRequestId) return;
    requestLockRef.current = true;
    setRequestingSeekerId(seeker.deviceId);
    const isSimulatedTest =
      seeker.deviceId.startsWith('dev_real_user_') || seeker.deviceId.startsWith('test_');

    const fromUserObj = {
      username: currentUser?.username || 'You',
      email: currentUser?.email || '',
      pickup: pickupLocation,
      drop: FIXED_DEST_NAME,
      coords: { lat: baseLat, lng: baseLng }
    };
    const toUserObj = {
      username: seeker.username,
      email: seeker.email || '',
      pickup: seeker.pickup,
      drop: seeker.drop || FIXED_DEST_NAME,
      coords: seeker.pickupCoords
    };

    try {
      const res = await carpoolFetch('/api/carpool/linkup/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDeviceId: deviceId,
          fromUser: fromUserObj,
          toDeviceId: seeker.deviceId,
          toUser: toUserObj,
          autoAccept: isSimulatedTest
        })
      });
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await res.json() : null;

      if (data && data.success && data.session && data.session.status === 'accepted') {
        onSetActiveSession(data.session);
        onSetPendingSentRequestId(null);
        setRequestingSeekerId(null);
        return;
      }
      if (data && data.success && data.requestId) {
        if (!isSimulatedTest && data.created && data.session) {
          await onBroadcastLinkUpRequest(data.session);
        }
        onSetPendingSentRequestId(data.requestId);
      } else {
        throw new Error(data?.message || 'Could not create a link up request.');
      }
    } catch (error: any) {
      setRequestingSeekerId(null);
      alert(error?.message || 'Could not create a link up request. Please try again.');
    } finally {
      requestLockRef.current = false;
    }
  };

  // Spawn a test commuter within 3 km heading to MIT-WPU
  const handleAddLiveTestCommuter = async () => {
    if (spawningTest) return;
    setSpawningTest(true);
    setScanning(false);

    const testId = 'dev_real_user_' + Date.now().toString(36).slice(-4) + '_' + Math.floor(100 + Math.random() * 900);
    const puneCommuters = [
      { name: 'Aarav Deshmukh', pickup: 'Karve Statue, Kothrud Stand', dLat: -0.005, dLng: 0.004 },
      { name: 'Tanvi Joshi', pickup: 'Chandani Chowk, Paud Road', dLat: -0.007, dLng: -0.010 },
      { name: 'Siddharth Kulkarni', pickup: 'Nal Stop Metro, Karve Road', dLat: 0.008, dLng: 0.011 },
      { name: 'Meera Patil', pickup: 'Ideal Colony Metro, Kothrud', dLat: 0.002, dLng: 0.003 },
      { name: 'Rohan Kulkarni', pickup: 'Anand Nagar Metro, Paud Road', dLat: -0.003, dLng: 0.007 },
      { name: 'Ananya Gokhale', pickup: 'Paud Phata Chowk, Kothrud', dLat: 0.006, dLng: -0.004 }
    ];

    const existingNames = new Set(visibleSeekers.map((s) => s.username));
    const available = puneCommuters.filter((c) => !existingNames.has(c.name));
    const chosen = available.length > 0
      ? available[0]
      : puneCommuters[Math.floor(Math.random() * puneCommuters.length)];

    const spawnedLat = baseLat + chosen.dLat;
    const spawnedLng = baseLng + chosen.dLng;
    const spawnedDistMeters = calcDistanceMeters(baseLat, baseLng, spawnedLat, spawnedLng);
    const spawnedCommuter: RealCommuter = {
      deviceId: testId,
      username: chosen.name,
      email: `${chosen.name.toLowerCase().replace(/\s+/g, '.')}@waygo.commute`,
      avatar: '👤',
      pickup: chosen.pickup,
      drop: FIXED_DEST_NAME,
      pickupCoords: { lat: spawnedLat, lng: spawnedLng },
      dropCoords: FIXED_DEST_COORDS,
      departTime: 'Leaving now',
      vehiclePreference: 'cab',
      distanceFromUserKm: Math.round(spawnedDistMeters) / 1000,
      distanceFromUserMeters: spawnedDistMeters,
      coordsAccuracyMeters: 4,
      locationSource: 'gps',
          locationStatus: 'active',
          locationFixTimestamp: Date.now(),
      routeMatchPercent: 96
    };

    // Immediately add to local fallback list so the UI updates right away
    setLocalTestSeekers((prev) => [...prev, spawnedCommuter]);

    try {
      await carpoolFetch('/api/carpool/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...spawnedCommuter,
          spawnedByDeviceId: deviceId
        })
      });
      await onRefreshNearby();
    } catch {
      // localTestSeekers fallback keeps the spawned commuter visible
    } finally {
      setSpawningTest(false);
    }
  };

  // Simulate an incoming link-up request from a test commuter to verify Accept & Connect / Decline views
  const handleSimulateIncomingRequest = async () => {
    if (simulatingIncoming) return;
    setSimulatingIncoming(true);
    const senderId = 'dev_real_user_inc_' + Math.floor(100 + Math.random() * 900);
    const senderCoords = { lat: baseLat - 0.004, lng: baseLng + 0.005 };

    try {
      await carpoolFetch('/api/carpool/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: senderId,
          spawnedByDeviceId: deviceId,
          username: 'Priya Nair',
          email: 'priya.nair@waygo.commute',
          pickup: 'Anand Nagar Metro, Kothrud',
          drop: FIXED_DEST_NAME,
          pickupCoords: senderCoords,
          dropCoords: FIXED_DEST_COORDS,
          departTime: 'Leaving now',
          vehiclePreference: 'cab',
          coordsAccuracyMeters: 8,
          locationSource: 'gps',
          locationStatus: 'active',
          locationFixTimestamp: Date.now()
        })
      });

      await carpoolFetch('/api/carpool/linkup/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDeviceId: senderId,
          fromUser: {
            username: 'Priya Nair',
            email: 'priya.nair@waygo.commute',
            pickup: 'Anand Nagar Metro, Kothrud',
            drop: FIXED_DEST_NAME,
            coords: senderCoords
          },
          toDeviceId: deviceId,
          toUser: {
            username: currentUser?.username || 'You',
            email: currentUser?.email || '',
            pickup: pickupLocation,
            drop: FIXED_DEST_NAME,
            coords: { lat: baseLat, lng: baseLng }
          },
          autoAccept: false
        })
      });
      await onRefreshNearby();
    } catch {
      // ignore
    } finally {
      setSimulatingIncoming(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Launch Native Cab App (or fallback to web) with pre-filled pickup and destination
  const handleOpenCabApp = (provider: 'uber' | 'ola' | 'rapido') => {
    if (!activeSession || !activeSession.midpoint) return;
    const mid = activeSession.midpoint;
    const midLat = mid.lat;
    const midLng = mid.lng;
    const midName = mid.name || `Shared Midpoint (${midLat.toFixed(4)}, ${midLng.toFixed(4)})`;
    const campusLat = 18.5178;
    const campusLng = 73.8151;
    const campusName = 'MIT World Peace University (MIT-WPU), Kothrud, Pune';

    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua);

    let appScheme = '';
    let webUrl = '';
    let androidIntent = '';
    const gMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${midLat},${midLng}&destination=${campusLat},${campusLng}&travelmode=driving`;

    if (provider === 'uber') {
      const qParams = `action=setPickup&client_id=waygo_pool&pickup[latitude]=${midLat}&pickup[longitude]=${midLng}&pickup[nickname]=${encodeURIComponent(midName)}&dropoff[latitude]=${campusLat}&dropoff[longitude]=${campusLng}&dropoff[nickname]=${encodeURIComponent(campusName)}`;
      appScheme = `uber://?${qParams}`;
      const pickupObj = encodeURIComponent(JSON.stringify({ latitude: midLat, longitude: midLng, address: midName }));
      const dropObj = encodeURIComponent(JSON.stringify({ latitude: campusLat, longitude: campusLng, address: campusName }));
      webUrl = `https://m.uber.com/looking?pickup=${pickupObj}&destination=${dropObj}`;
      androidIntent = `intent://m.uber.com/looking?pickup=${pickupObj}&destination=${dropObj}#Intent;package=com.ubercab;scheme=https;end;`;
    } else if (provider === 'ola') {
      appScheme = `olacabs://app/launch?lat=${midLat}&lng=${midLng}&category_id=1&landing_page=bk&drop_lat=${campusLat}&drop_lng=${campusLng}&drop_name=${encodeURIComponent(campusName)}`;
      webUrl = `https://book.olacabs.com/?lat=${midLat}&lng=${midLng}&pickup_name=${encodeURIComponent(midName)}&drop_lat=${campusLat}&drop_lng=${campusLng}&drop_name=${encodeURIComponent(campusName)}`;
      androidIntent = `intent://book.olacabs.com/?lat=${midLat}&lng=${midLng}&pickup_name=${encodeURIComponent(midName)}&drop_lat=${campusLat}&drop_lng=${campusLng}&drop_name=${encodeURIComponent(campusName)}#Intent;package=com.olacabs.customer;scheme=https;end;`;
    } else if (provider === 'rapido') {
      const qParams = `pickup_lat=${midLat}&pickup_lng=${midLng}&pickup_address=${encodeURIComponent(midName)}&drop_lat=${campusLat}&drop_lng=${campusLng}&drop_address=${encodeURIComponent(campusName)}`;
      appScheme = `rapido://ride?${qParams}`;
      webUrl = gMapsUrl;
      androidIntent = `intent://ride?${qParams}#Intent;package=com.rapido.passenger;scheme=rapido;end;`;
    }

    const splitFare = provider === 'uber'
      ? activeSession.fareComparison?.uber?.splitFarePerPerson
      : provider === 'ola'
      ? activeSession.fareComparison?.ola?.splitFarePerPerson
      : activeSession.fareComparison?.rapido?.splitFarePerPerson;

    setBookingDialog({
      provider,
      title: provider === 'uber' ? 'Uber Go' : provider === 'ola' ? 'Ola Mini/Prime' : 'Rapido Cab Eco',
      url: webUrl,
      midpointName: midName,
      destinationName: campusName,
      splitFare: splitFare || 50,
      gMapsUrl
    });

    if (isAndroid) {
      window.location.href = androidIntent;
    } else if (isIOS) {
      window.location.href = appScheme;
    } else {
      window.open(webUrl, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[720px] max-h-[92vh] overflow-y-auto rounded-3xl border border-white/20 bg-gradient-to-br from-[#0c182b]/98 via-[#0f2137]/98 to-[#091424]/98 shadow-2xl text-white relative p-6 sm:p-8">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/80 transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Live Device Broadcast Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5 pb-3 border-b border-white/10 pr-8">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-xs font-bold text-emerald-300">
              3 km Live Device Radar
            </span>
            <span className="text-[11px] text-white/50">
              — {currentUser?.email || currentUser?.username} ({deviceId.substring(0, 12)}...)
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleManualRadarRefresh}
              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-[11px] text-cyan-200 flex items-center gap-1 transition cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${refreshingRadar ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] text-white flex items-center gap-1 transition cursor-pointer"
            >
              <Share2 className="w-3 h-3" />
              <span>{copySuccess ? 'Link Copied!' : 'Share Live Room'}</span>
            </button>
          </div>
        </div>

        {/* Link-Up Notice Banner (e.g., partner cancelled or declined) */}
        {linkupNotice && !activeSession && (
          <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/40 text-amber-100 text-xs font-semibold flex items-center justify-between gap-3">
            <span>ℹ️ {linkupNotice}</span>
            {onDismissLinkupNotice && (
              <button
                type="button"
                onClick={onDismissLinkupNotice}
                className="p-1 rounded-lg hover:bg-white/10 text-amber-200 cursor-pointer shrink-0"
                aria-label="Dismiss notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {pendingSentRequestId && !activeSession && (
          <div className="mb-4 p-3 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-100 text-xs flex items-center justify-between gap-3">
            <span>Waiting for the other commuter to respond. This request expires automatically.</span>
            {onCancelPendingLinkUp && (
              <button type="button" onClick={onCancelPendingLinkUp} className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold cursor-pointer">
                Cancel request
              </button>
            )}
          </div>
        )}

        {/* BANNER: INCOMING REAL LINK UP REQUEST */}
        {incomingRequest && !activeSession && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 border-2 border-emerald-400 shadow-xl mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/30 text-emerald-200 text-[10px] font-black uppercase tracking-wider mb-1">
                  Incoming Link Up Request
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {incomingRequest.fromUser.username} wants to share a cab with you!
                </h3>
                {incomingRequest.fromUser.email && (
                  <p className="text-[11px] text-cyan-200 mt-0.5">{incomingRequest.fromUser.email}</p>
                )}
                <p className="text-xs text-slate-200 mt-0.5">
                  Pickup: <strong>{incomingRequest.fromUser.pickup}</strong> → Destination: <strong>{incomingRequest.fromUser.drop}</strong>
                </p>
                <div className="text-[11px] text-emerald-300 mt-1 font-semibold">
                  ⚡ Accepting will connect your profiles, compute the shared middle pickup spot, and split cab fares 50/50.
                </div>
              </div>
            </div>
            <div className="flex gap-2.5 mt-4">
              <button
                type="button"
                onClick={onAcceptIncoming}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs shadow-lg transition cursor-pointer"
              >
                ✓ Accept & Connect
              </button>
              <button
                type="button"
                onClick={onDeclineIncoming}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-semibold text-xs transition cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: RADAR SCANNING STATE */}
        {scanning && (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <div className="relative w-36 h-36 mb-6 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping duration-1000"></div>
              <div className="absolute inset-4 rounded-full border border-cyan-500/30"></div>
              <div className="absolute inset-8 rounded-full border border-emerald-400/40"></div>
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500/30 via-transparent to-transparent animate-spin duration-700"></div>
              <div className="relative z-10 w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-400 flex items-center justify-center text-white shadow-[0_0_20px_#10b981]">
                <Radar className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <h2 className="text-xl font-bold font-serif mb-1">
              Scanning 3 km Radius for Active Accounts...
            </h2>
            <p className="text-xs text-slate-300 max-w-sm">
              Discovering different WayGo accounts logged in on other devices within 3 km in real time.
            </p>
          </div>
        )}

        {/* VIEW 2: NO OTHER USERS ONLINE YET (HONEST EMPTY STATE) */}
        {!scanning && !activeSession && visibleSeekers.length === 0 && (
          <div className="py-8 text-center animate-fadeIn">
            <div className="w-16 h-16 rounded-3xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-2xl mx-auto mb-4 shadow-lg">
              📡
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Your Device is Broadcasting Live (3 km Range)</span>
            </div>
            <h3 className="text-2xl font-bold font-serif mb-2 text-white">
              No other accounts active within 3 km right now
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed mb-6">
              Your account is broadcasting live. As soon as another user logs into a different WayGo account on another device within 3 km, they will appear here automatically in real time.
            </p>

            {/* Current Broadcast Detail Card */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 max-w-md mx-auto text-left text-xs mb-6 space-y-2.5">
              <div className="flex items-center justify-between text-white/50 text-[10px] uppercase font-bold gap-2">
                <span>Active Broadcast (3 km Range)</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400 font-normal">
                    {locationSource === 'gps'
                      ? '📍 Live GPS'
                      : locationSource === 'ip'
                      ? '🌐 Network Location'
                      : locationSource === 'manual'
                      ? '📌 Custom Area'
                      : '⚙️ Default Pune'}
                  </span>
                  {locationSource === 'gps' && gpsAccuracyMeters !== null && (
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                        gpsAccuracyMeters <= 25
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : gpsAccuracyMeters <= 100
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      }`}
                    >
                      ±{gpsAccuracyMeters} m
                    </span>
                  )}
                </div>
              </div>
              <div className="text-white font-semibold">
                👤 Account: <strong className="text-cyan-300">{currentUser?.username || 'You'}</strong>
                {currentUser?.email && <span className="text-white/50 font-normal"> ({currentUser.email})</span>}
              </div>
              <div className="text-slate-300 flex items-start justify-between gap-2">
                <div>
                  <span className="text-emerald-400 font-bold">📍 Pickup:</span>{' '}
                  <span className="text-white font-medium">{pickupLocation}</span>
                  <div className="text-[10px] text-white/40 font-mono mt-0.5">
                    Coords: {baseLat.toFixed(5)}, {baseLng.toFixed(5)}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {onCalibrateGps && (
                    <button
                      type="button"
                      onClick={onCalibrateGps}
                      disabled={calibratingGps || locatingUser}
                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30 hover:bg-emerald-500/30 transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      <Crosshair className={`w-3 h-3 ${calibratingGps ? 'animate-spin' : ''}`} />
                      <span>{calibratingGps ? 'Calibrating...' : 'Calibrate GPS'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onRefreshLocation}
                    disabled={locatingUser}
                    className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-400/30 hover:bg-cyan-500/30 transition cursor-pointer"
                  >
                    {locatingUser && !calibratingGps ? 'Locating...' : '🔄 Re-detect GPS'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAreaSearch(!showAreaSearch)}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/80 font-semibold border border-white/15 hover:bg-white/20 transition cursor-pointer"
                  >
                    {showAreaSearch ? 'Hide Search' : '✏️ Set Area'}
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-white/45">
                Location status: {locationStatus.replace('_', ' ')}
                {locationFixTimestamp ? ` · Updated ${Math.max(0, Math.floor((Date.now() - locationFixTimestamp) / 1000))}s ago` : ''}
              </div>

              {showAreaSearch && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <form onSubmit={handleSearchArea} className="flex gap-1.5">
                    <input
                      type="text"
                      value={areaQuery}
                      onChange={(e) => setAreaQuery(e.target.value)}
                      placeholder="Search your neighborhood / city..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-white/20 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="submit"
                      disabled={searchingArea}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/30 hover:bg-cyan-500/40 text-cyan-200 font-bold text-[11px] cursor-pointer"
                    >
                      {searchingArea ? '...' : 'Find'}
                    </button>
                  </form>
                  {areaResults.length > 0 && (
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {areaResults.map((place, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const shortName = place.display_name.split(',').slice(0, 3).join(', ');
                            onSetCustomLocation(Number(place.lat), Number(place.lon), shortName);
                            setShowAreaSearch(false);
                            setAreaResults([]);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-[11px] text-slate-200 transition cursor-pointer truncate"
                        >
                          📍 {place.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="text-slate-300">
                <span className="text-rose-400 font-bold">🏁 Destination:</span>{' '}
                <strong className="text-white">MIT World Peace University (MIT-WPU), Kothrud, Pune</strong>{' '}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 ml-1">
                  🏫 Fixed
                </span>
              </div>

              {(locationError === 'blocked' || locationSource !== 'gps') && (
                <div className="pt-2.5 border-t border-white/10 text-[11px] text-amber-200/90 space-y-1.5">
                  <div>
                    ⚠️{' '}
                    {locationError === 'blocked'
                      ? 'Browser or device permission blocked GPS. Any network fallback is approximate; if none is available, WayGo will not broadcast a location.'
                      : locationStatus === 'unavailable'
                      ? 'GPS is unavailable. Retry location or choose a network estimate or manual area; no live GPS position is being broadcast.'
                      : locationSource === 'ip'
                      ? 'Using approximate network location rather than Live GPS — distances can vary by several kilometres.'
                      : locationSource === 'manual'
                      ? 'Using your manually selected area. Distances are approximate until GPS is available.'
                      : 'Waiting for a confirmed location. Your default map position is not being broadcast.'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-bold transition"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open Full Tab for Live GPS</span>
                    </a>
                  </div>
                </div>
              )}

              {outOfRangeSeekers.length > 0 && (
                <div className="pt-2.5 border-t border-white/10 text-[11px] space-y-1.5">
                  <div className="text-cyan-300 font-bold">
                    🌐 {outOfRangeSeekers.length} other live account{outOfRangeSeekers.length > 1 ? 's' : ''} online outside 3 km:
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {outOfRangeSeekers.map((peer) => (
                      <div
                        key={peer.deviceId}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-white/10 text-[11px]"
                      >
                        <span className="text-white font-semibold truncate">
                          {peer.username} {peer.email ? `(${peer.email})` : ''}
                        </span>
                        <span className="text-amber-300 font-mono shrink-0">
                          {formatPreciseDistance(peer.distanceFromUserMeters, peer.distanceFromUserKm)} away
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    If you are together in person, tap <strong>✏️ Set Area</strong> above or open in a full browser tab with GPS enabled so both devices use accurate coordinates.
                  </div>
                </div>
              )}
            </div>

            {/* Quick Testing Options */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 max-w-lg mx-auto">
              <button
                type="button"
                disabled={spawningTest}
                onClick={handleAddLiveTestCommuter}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <span>{spawningTest ? 'Spawning Commuter...' : '⚡ Spawn Test Commuter (<3 km)'}</span>
              </button>
              <button
                type="button"
                disabled={simulatingIncoming}
                onClick={handleSimulateIncomingRequest}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <span>{simulatingIncoming ? 'Sending...' : '📩 Simulate Incoming Request'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Open in 2nd Device / Tab</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: REAL COMMUTERS FOUND NEARBY WITHIN 3 KM */}
        {!scanning && !activeSession && visibleSeekers.length > 0 && (
          <div>
            <div className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {visibleSeekers.length} Account{visibleSeekers.length > 1 ? 's' : ''} Online Within 3 km
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={simulatingIncoming}
                    onClick={handleSimulateIncomingRequest}
                    className="text-xs text-emerald-300 hover:text-emerald-200 flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {simulatingIncoming ? 'Sending...' : '📩 Simulate Incoming'}
                  </button>
                  <button
                    type="button"
                    disabled={spawningTest}
                    onClick={handleAddLiveTestCommuter}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {spawningTest ? 'Spawning...' : '⚡ Spawn Test Commuter (<3 km)'}
                  </button>
                </div>
              </div>
              <h2 className="text-2xl font-extrabold font-serif mb-1">
                Nearby Accounts Ready to Link Up (≤ 3 km)
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                Real-time radar detected {visibleSeekers.length} different account{visibleSeekers.length > 1 ? 's' : ''} on other devices within 3 km. Tap <strong>Send Link Up Request</strong> to connect.
              </p>
              <div className="mt-3 p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-300 flex flex-wrap items-center gap-1.5">
                  <span>
                    📍 Scanning within 3 km of <strong className="text-white">{pickupLocation}</strong>{' '}
                    <span className="text-white/40 font-mono">({baseLat.toFixed(5)}, {baseLng.toFixed(5)})</span>
                  </span>
                  {locationSource === 'gps' && gpsAccuracyMeters !== null ? (
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold border ${
                        gpsAccuracyMeters <= 25
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : gpsAccuracyMeters <= 100
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                      }`}
                    >
                      GPS ±{gpsAccuracyMeters} m
                    </span>
                  ) : locationSource === 'ip' ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 font-mono text-[10px] font-bold">
                      Approx IP Fix
                    </span>
                  ) : null}
                </span>
                <div className="flex items-center gap-1.5">
                  {onCalibrateGps && (
                    <button
                      type="button"
                      onClick={onCalibrateGps}
                      disabled={calibratingGps || locatingUser}
                      className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-400/30 hover:bg-emerald-500/30 cursor-pointer flex items-center gap-1 disabled:opacity-60"
                    >
                      <Crosshair className={`w-3 h-3 ${calibratingGps ? 'animate-spin' : ''}`} />
                      <span>{calibratingGps ? 'Calibrating...' : 'Calibrate GPS'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onRefreshLocation}
                    disabled={locatingUser}
                    className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-400/30 hover:bg-cyan-500/30 cursor-pointer"
                  >
                    {locatingUser && !calibratingGps ? 'Locating...' : '🔄 GPS'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAreaSearch(!showAreaSearch)}
                    className="px-2 py-0.5 rounded bg-white/10 text-white/80 font-semibold border border-white/15 hover:bg-white/20 cursor-pointer"
                  >
                    {showAreaSearch ? 'Hide Search' : '✏️ Set Area'}
                  </button>
                </div>
              </div>
              {(locationSource === 'ip' || (gpsAccuracyMeters !== null && gpsAccuracyMeters > 100)) && (
                <div className="mt-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200">
                  ⚠️ Your device currently has a coarse location fix ({locationSource === 'ip' ? 'IP/Network' : `±${gpsAccuracyMeters} m`}). Tap <strong>Calibrate GPS</strong> (or open in a full mobile browser tab) for meter-level accuracy.
                </div>
              )}
              {showAreaSearch && (
                <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/15 space-y-2">
                  <form onSubmit={handleSearchArea} className="flex gap-1.5">
                    <input
                      type="text"
                      value={areaQuery}
                      onChange={(e) => setAreaQuery(e.target.value)}
                      placeholder="Search your neighborhood / city..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-white/20 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="submit"
                      disabled={searchingArea}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500/30 hover:bg-cyan-500/40 text-cyan-200 font-bold text-[11px] cursor-pointer"
                    >
                      {searchingArea ? '...' : 'Find'}
                    </button>
                  </form>
                  {areaResults.length > 0 && (
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {areaResults.map((place, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const shortName = place.display_name.split(',').slice(0, 3).join(', ');
                            onSetCustomLocation(Number(place.lat), Number(place.lon), shortName);
                            setShowAreaSearch(false);
                            setAreaResults([]);
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-[11px] text-slate-200 transition cursor-pointer truncate"
                        >
                          📍 {place.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* List of Real Commuters */}
            <div className="space-y-4">
              {visibleSeekers.map((seeker) => {
                const isRequesting = requestingSeekerId === seeker.deviceId;
                const isPending = Boolean(pendingSentRequestId && isRequesting);

                return (
                  <div
                    key={seeker.deviceId}
                    className="p-4 sm:p-5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 hover:border-emerald-400/40 transition duration-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Left: Real User Details */}
                      <div className="flex items-start gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600/30 to-cyan-600/30 border border-white/20 flex items-center justify-center text-2xl shrink-0 shadow-md">
                          {seeker.avatar || '👤'}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-base text-white">{seeker.username}</h3>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                              Live Account
                            </span>
                            <span className="text-[10px] text-cyan-300 font-mono">
                              {seeker.deviceId.substring(0, 10)}
                            </span>
                          </div>
                          {seeker.email && (
                            <div className="text-[11px] text-cyan-200/80 mt-0.5">{seeker.email}</div>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-300">
                            <span className="flex items-center gap-1 text-cyan-300 font-semibold">
                              <Navigation className="w-3 h-3" />{' '}
                              {formatPreciseDistance(seeker.distanceFromUserMeters, seeker.distanceFromUserKm)} away
                            </span>
                            {seeker.distanceUncertaintyMeters != null && seeker.distanceUncertaintyMeters > 0 && (
                              <span className="text-[10px] text-amber-300">approx. ±{seeker.distanceUncertaintyMeters} m</span>
                            )}
                            {seeker.coordsAccuracyMeters != null && seeker.locationSource === 'gps' ? (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                                  seeker.coordsAccuracyMeters <= 25
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                                    : seeker.coordsAccuracyMeters <= 100
                                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30'
                                    : 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                                }`}
                              >
                                ±{seeker.coordsAccuracyMeters}m GPS
                              </span>
                            ) : seeker.locationSource === 'ip' ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/30 font-mono">
                                Network/Approx
                              </span>
                            ) : null}
                            <span>•</span>
                            <span className="flex items-center gap-1 text-emerald-400 font-bold">
                              <Sparkles className="w-3 h-3" /> {seeker.routeMatchPercent}% Route Match
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3" /> {seeker.departTime}
                            </span>
                          </div>

                          <div className="mt-2 text-xs text-slate-300">
                            <div className="flex items-center gap-1 text-slate-400">
                              <span className="text-emerald-400">📍</span> Pickup: <strong className="text-white ml-1">{seeker.pickup}</strong>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400 mt-0.5">
                              <span className="text-rose-400">🏁</span> Destination: <strong className="text-white ml-1">{seeker.drop}</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Link Up Button */}
                      <div className="sm:self-center shrink-0">
                        <button
                          type="button"
                          disabled={isPending || isRequesting || Boolean(pendingSentRequestId)}
                          onClick={() => handleSendLinkUp(seeker)}
                          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition transform hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                        >
                          {isPending || isRequesting ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Waiting for Acceptance...</span>
                            </>
                          ) : (
                            <>
                              <span>⚡ Send Link Up Request</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 4: LINK UP ACCEPTED! */}
        {activeSession && (() => {
          const isSender =
            activeSession.fromDeviceId === deviceId ||
            (activeSession.fromUser?.email &&
              currentUser?.email &&
              activeSession.fromUser.email.toLowerCase() === currentUser.email.toLowerCase());
          const partner = isSender ? activeSession.toUser : activeSession.fromUser;
          const partnerDeviceId = isSender ? activeSession.toDeviceId : activeSession.fromDeviceId;
          const isPartnerTestBot =
            Boolean(partnerDeviceId) &&
            (partnerDeviceId.startsWith('dev_real_user_') || partnerDeviceId.startsWith('test_'));
          return (
          <div className="animate-fadeIn">
            {/* Success Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-cyan-500/20 border border-emerald-400/40 mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white text-xl shadow-lg">
                  🤝
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-emerald-300">
                    Linked Up with {partner.username}!
                  </h3>
                  <p className="text-xs text-slate-200">
                    Real device handshake confirmed. Both riders are synchronized.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onCallPartner && partnerDeviceId && !isPartnerTestBot ? (
                  <button
                    type="button"
                    disabled={isCallActive}
                    onClick={() =>
                      onCallPartner({
                        deviceId: partnerDeviceId,
                        username: partner.username,
                        email: partner.email
                      })
                    }
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{isCallActive ? 'Call In Progress' : `Call ${partner.username}`}</span>
                  </button>
                ) : (
                  <span className="hidden sm:inline-block text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/30 text-emerald-200 font-bold">
                    Live Session Active
                  </span>
                )}
              </div>
            </div>

            {/* Section 1: Connected Riders */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/15 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-sm font-bold text-white">Connected Riders</h4>
                </div>
                <span className="text-[11px] text-cyan-300 font-semibold">No Phone Numbers • Direct In-App Contact</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Partner Card */}
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-emerald-400/30 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl shrink-0">👤</span>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">{partner.username} (Partner)</div>
                      <div className="text-emerald-400 text-[11px] font-medium truncate mt-0.5">
                        {partner.email || 'Verified WayGo Commuter'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onCallPartner && partnerDeviceId && !isPartnerTestBot && (
                      <button
                        type="button"
                        disabled={isCallActive}
                        onClick={() =>
                          onCallPartner({
                            deviceId: partnerDeviceId,
                            username: partner.username,
                            email: partner.email
                          })
                        }
                        className="px-2.5 py-2 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 border border-emerald-400/40 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                        title="In-Website Voice Call (No Phone Number)"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </button>
                    )}
                    {partner.email && (
                      <a
                        href={`mailto:${partner.email}`}
                        className="p-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition cursor-pointer"
                        title="Email Partner"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Current User Card */}
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-2xl shrink-0">👤</span>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">{currentUser?.username || 'You'}</div>
                      <div className="text-slate-300 text-[11px] truncate mt-0.5">
                        {currentUser?.email || 'Verified WayGo Profile'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-white/50 px-2 py-1 rounded bg-white/5 border border-white/10 shrink-0">
                    Your Profile
                  </span>
                </div>
              </div>
              {isPartnerTestBot && (
                <div className="mt-3 text-[11px] text-slate-400">
                  ℹ️ You are linked with a simulated test commuter. Link up with a real user account on another device to place a live in-website WebRTC voice call.
                </div>
              )}
            </div>

            {/* Section 2: Ideal Best Middle Meeting Point */}
            {activeSession.midpoint && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 to-slate-900/80 border border-cyan-500/40 mb-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-bold text-white">Ideal Best Middle Pickup Point</h4>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30">
                    Equal 50/50 Split Spot
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/10 mb-3">
                  <div className="text-xs uppercase font-bold text-cyan-400 tracking-wider mb-1">
                    📍 Calculated Equidistant Spot:
                  </div>
                  <div className="text-base font-extrabold text-white">
                    {activeSession.midpoint.name}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {activeSession.midpoint.advantageNote}
                  </p>
                </div>

                {/* Walking Distance Breakdown for Both Users */}
                <div className="grid grid-cols-2 gap-2 text-xs text-center">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-slate-400 block uppercase">Walk from You</span>
                    <strong className="text-white text-sm font-bold">{activeSession.midpoint.distanceFromUser}</strong>
                    <span className="text-[10px] text-cyan-300 block">({activeSession.midpoint.walkingTimeUser})</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] text-slate-400 block uppercase">Walk from Partner</span>
                    <strong className="text-white text-sm font-bold">{activeSession.midpoint.distanceFromPartner}</strong>
                    <span className="text-[10px] text-cyan-300 block">({activeSession.midpoint.walkingTimePartner})</span>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Live Aggregator Fares */}
            {activeSession.fareComparison && (
              <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/15">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>🚕</span> Live Cab Fares & Instant Booking Links
                    </h4>
                    <p className="text-xs text-slate-300">
                      Book from the middle point. Your pooled fare is split in half!
                    </p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <span className="text-[11px] text-emerald-400 font-bold block">50% Savings Active</span>
                    <span className="text-[10px] text-white/50">{activeSession.fareComparison.totalDistanceKm} km route</span>
                  </div>
                </div>

                {/* Pre-configured Route Banner */}
                <div className="mb-3 space-y-2">
                  <div className="p-2.5 rounded-xl bg-cyan-950/60 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏫</span>
                      <span className="text-slate-200">
                        Pre-set Destination: <strong className="text-white">MIT World Peace University (MIT-WPU), Kothrud, Pune</strong>
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                      Auto-Configured in Cab Apps
                    </span>
                  </div>
                  {activeSession.fareComparison.trafficCondition && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                        <span className="text-slate-300">Live Traffic & Pricing Index:</span>
                        <strong className="text-emerald-300">{activeSession.fareComparison.trafficCondition}</strong>
                      </div>
                      <div className="text-[11px] text-emerald-400/80 font-mono">
                        Synced at {activeSession.fareComparison.updatedAt}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 1. UBER CARD */}
                  <div className="p-4 rounded-2xl border border-white/15 bg-gradient-to-b from-[#111827] to-[#0b121e] flex flex-col justify-between hover:border-white/35 transition group">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-lg tracking-wider text-white">UBER</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/80 font-bold">
                          Uber Go
                        </span>
                      </div>
                      <div className="my-2.5">
                        <div className="text-xs text-slate-400 line-through">
                          Solo Fare: ₹{activeSession.fareComparison.uber.soloFare}
                        </div>
                        <div className="text-2xl font-black text-emerald-400 mt-0.5">
                          ₹{activeSession.fareComparison.uber.splitFarePerPerson}{' '}
                          <span className="text-xs font-semibold text-slate-300">/ person</span>
                        </div>
                        <div className="text-[11px] text-emerald-300 font-bold flex items-center gap-1 mt-1">
                          <TrendingDown className="w-3 h-3" /> Save ₹{activeSession.fareComparison.uber.savedPerPerson} each
                        </div>
                        {activeSession.fareComparison.uber.rateBreakdown && (
                          <div className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-white/10 font-mono leading-tight">
                            {activeSession.fareComparison.uber.rateBreakdown}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenCabApp('uber')}
                      className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg mt-2 cursor-pointer active:scale-95"
                    >
                      <span>🚗 Open in Uber App</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 2. OLA CARD */}
                  <div className="p-4 rounded-2xl border border-white/15 bg-gradient-to-b from-[#111827] to-[#0b121e] flex flex-col justify-between hover:border-yellow-400/40 transition group">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-lg tracking-wider text-yellow-400">OLA</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-300 font-bold border border-yellow-400/20">
                          Mini / Prime
                        </span>
                      </div>
                      <div className="my-2.5">
                        <div className="text-xs text-slate-400 line-through">
                          Solo Fare: ₹{activeSession.fareComparison.ola.soloFare}
                        </div>
                        <div className="text-2xl font-black text-emerald-400 mt-0.5">
                          ₹{activeSession.fareComparison.ola.splitFarePerPerson}{' '}
                          <span className="text-xs font-semibold text-slate-300">/ person</span>
                        </div>
                        <div className="text-[11px] text-emerald-300 font-bold flex items-center gap-1 mt-1">
                          <TrendingDown className="w-3 h-3" /> Save ₹{activeSession.fareComparison.ola.savedPerPerson} each
                        </div>
                        {activeSession.fareComparison.ola.rateBreakdown && (
                          <div className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-white/10 font-mono leading-tight">
                            {activeSession.fareComparison.ola.rateBreakdown}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenCabApp('ola')}
                      className="w-full py-2.5 px-3 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg mt-2 cursor-pointer active:scale-95"
                    >
                      <span>🚖 Open in Ola App</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 3. RAPIDO CARD */}
                  <div className="p-4 rounded-2xl border border-white/15 bg-gradient-to-b from-[#111827] to-[#0b121e] flex flex-col justify-between hover:border-amber-500/40 transition group">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-lg tracking-wider text-amber-400">RAPIDO</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 font-bold border border-amber-400/20">
                          Cab Economy
                        </span>
                      </div>
                      <div className="my-2.5">
                        <div className="text-xs text-slate-400 line-through">
                          Solo Fare: ₹{activeSession.fareComparison.rapido.soloFare}
                        </div>
                        <div className="text-2xl font-black text-emerald-400 mt-0.5">
                          ₹{activeSession.fareComparison.rapido.splitFarePerPerson}{' '}
                          <span className="text-xs font-semibold text-slate-300">/ person</span>
                        </div>
                        <div className="text-[11px] text-emerald-300 font-bold flex items-center gap-1 mt-1">
                          <TrendingDown className="w-3 h-3" /> Save ₹{activeSession.fareComparison.rapido.savedPerPerson} each
                        </div>
                        {activeSession.fareComparison.rapido.rateBreakdown && (
                          <div className="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-white/10 font-mono leading-tight">
                            {activeSession.fareComparison.rapido.rateBreakdown}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenCabApp('rapido')}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg mt-2 cursor-pointer active:scale-95"
                    >
                      <span>🚕 Open in Rapido App</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Done & Cancel Link Up Actions */}
            <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap justify-between items-center gap-3">
              {!confirmCancelLinkUp ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancelLinkUp(true)}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 text-rose-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel Link Up</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-rose-950/50 border border-rose-400/40">
                  <span className="text-[11px] text-rose-200 font-semibold px-1.5">
                    Cancel confirmed link up?
                  </span>
                  <button
                    type="button"
                    disabled={cancellingLinkUp}
                    onClick={handleConfirmCancelSession}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    {cancellingLinkUp ? 'Cancelling...' : 'Yes, Cancel Link Up'}
                  </button>
                  <button
                    type="button"
                    disabled={cancellingLinkUp}
                    onClick={() => setConfirmCancelLinkUp(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold transition cursor-pointer"
                  >
                    Keep
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition cursor-pointer"
              >
                Close & Return
              </button>
            </div>
          </div>
          );
        })()}

        {/* Browser Pre-Filled Booking Dispatch Dialog */}
        {bookingDialog && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
            <div className="w-full max-w-md rounded-3xl border border-white/25 bg-[#0b1728] p-6 shadow-2xl relative text-left">
              <button
                onClick={() => setBookingDialog(null)}
                className="absolute right-4 top-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition"
              >
                ✕
              </button>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🚕</span>
                <h3 className="text-lg font-bold text-white">Pre-Filled {bookingDialog.title} Booking</h3>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                A browser tab was launched with your route. Both pickup and destination locations are pre-set for this pooled ride:
              </p>
              <div className="space-y-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs mb-4">
                <div>
                  <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wider">
                    📍 Pickup (Shared Midpoint)
                  </span>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-white font-medium text-xs break-words">
                      {bookingDialog.midpointName}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(bookingDialog.midpointName);
                        setCopiedField('pickup');
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 font-semibold cursor-pointer shrink-0 transition"
                    >
                      {copiedField === 'pickup' ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="border-t border-white/10 pt-2.5">
                  <span className="text-[10px] text-rose-400 font-bold block uppercase tracking-wider">
                    🏁 Destination (Fixed Campus)
                  </span>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-white font-medium text-xs break-words">
                      {bookingDialog.destinationName}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(bookingDialog.destinationName);
                        setCopiedField('drop');
                        setTimeout(() => setCopiedField(null), 2000);
                      }}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 font-semibold cursor-pointer shrink-0 transition"
                    >
                      {copiedField === 'drop' ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div className="border-t border-white/10 pt-2 flex items-center justify-between">
                  <span className="text-slate-300 font-medium">Split Fare Per Person:</span>
                  <strong className="text-emerald-400 text-sm font-black">₹{bookingDialog.splitFare} (50% Off)</strong>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={bookingDialog.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs text-center shadow-lg transition"
                >
                  Re-Open {bookingDialog.title} Web Route →
                </a>
                <a
                  href={bookingDialog.gMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs text-center border border-white/15 transition"
                >
                  Open in Google Maps Taxi (Uber & Ola Direct) →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
