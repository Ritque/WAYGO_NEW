import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User,
  PoolingMode,
  RideBooking,
  RealCommuter,
  ActiveVoiceCall,
  CallSignalKind,
  CallSignalPayload
} from './types';
import { WayGoLogo } from './components/WayGoLogo';
import { OtpVerificationModal } from './components/OtpVerificationModal';
import { RideMapModal } from './components/RideMapModal';
import { PoolingSelectionModal } from './components/PoolingSelectionModal';
import { CurrentRideModal } from './components/CurrentRideModal';
import { ScheduleModal } from './components/ScheduleModal';
import { SettingsModal } from './components/SettingsModal';
import { ProfilePanel } from './components/ProfilePanel';
import { AmbientBackground } from './components/AmbientBackground';
import { CarpoolScannerModal } from './components/CarpoolScannerModal';
import { InWebsiteCallOverlay } from './components/InWebsiteCallOverlay';
import { DailyQuote } from './components/DailyQuote';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { getUserData, setUserData, deleteUserData } from './userData';
import { carpoolFetch } from './utils/carpoolApi';
import { BrowserLocationManager, LocationStatus } from './utils/locationManager';
import {
  FIXED_DEST_NAME,
  FIXED_DEST_COORDS,
  DETECTION_RADIUS_KM,
  SUPABASE_CARPOOL_CHANNEL,
  LocationSource,
  calcDistanceMeters,
  buildLinkUpSessionPayload,
  extractRealtimePeerStatuses
} from './utils/carpoolRealtime';
import { CheckCircle2, Phone, X } from 'lucide-react';

export default function App() {
  // Page Navigation State
  const [currentPage, setCurrentPage] = useState<'login' | 'register' | 'home'>('login');

  // User State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register Form State
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // OTP Verification States
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpTarget, setOtpTarget] = useState('');
  const [pendingRegistration, setPendingRegistration] = useState<{ email: string; password: string; username: string } | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const registrationLock = useRef(false);

  // Modals & Panels State
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [scheduleSubmenuOpen, setScheduleSubmenuOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [poolingModalOpen, setPoolingModalOpen] = useState(false);
  const [rideModalOpen, setRideModalOpen] = useState(false);
  const [carpoolScannerOpen, setCarpoolScannerOpen] = useState(false);
  const [selectedPoolingType, setSelectedPoolingType] = useState<PoolingMode | null>(null);
  const [currentRideModalOpen, setCurrentRideModalOpen] = useState(false);
  const [currentRide, setCurrentRide] = useState<RideBooking | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Day Greeting
  const [dayGreeting, setDayGreeting] = useState('Happy Day!');

  // Real-time 3km Multi-Device Detection & Link-Up State
  const [deviceId, setDeviceId] = useState<string>('');
  const [livePickupLocation, setLivePickupLocation] = useState<string>('Detecting your location...');
  const [livePickupCoords, setLivePickupCoords] = useState<{ lat: number; lng: number }>({
    lat: 18.5089,
    lng: 73.8080
  });
  const [locatingUser, setLocatingUser] = useState(false);
  const [calibratingGps, setCalibratingGps] = useState(false);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>('default');
  const [locationError, setLocationError] = useState<'blocked' | 'unavailable' | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('acquiring');
  const [locationFixTimestamp, setLocationFixTimestamp] = useState<number | null>(null);
  const [nearbyCommuters, setNearbyCommuters] = useState<RealCommuter[]>([]);
  const [outOfRangeCommuters, setOutOfRangeCommuters] = useState<RealCommuter[]>([]);
  const [incomingLinkUp, setIncomingLinkUp] = useState<any | null>(null);
  const [acceptedLinkUpSession, setAcceptedLinkUpSession] = useState<any | null>(null);
  const [pendingSentRequestId, setPendingSentRequestId] = useState<string | null>(null);
  const [linkupNotice, setLinkupNotice] = useState<string | null>(null);
  const [confirmHomeCancel, setConfirmHomeCancel] = useState(false);

  // In-Website WebRTC Voice Calling State (No Phone Number)
  const [activeCall, setActiveCall] = useState<ActiveVoiceCall | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [callAudioLevel, setCallAudioLevel] = useState(0.2);

  const liveCoordsRef = useRef(livePickupCoords);
  const livePickupRef = useRef(livePickupLocation);
  const pendingSentRef = useRef(pendingSentRequestId);
  const acceptedLinkUpRef = useRef<any | null>(acceptedLinkUpSession);
  const currentUserRef = useRef(currentUser);
  const locationSourceRef = useRef<LocationSource>(locationSource);
  const locationStatusRef = useRef<LocationStatus>(locationStatus);
  const locationManagerRef = useRef<BrowserLocationManager | null>(null);
  const gpsAccuracyRef = useRef<number | null>(gpsAccuracyMeters);
  const locationFixTimestampRef = useRef<number | null>(locationFixTimestamp);
  const linkupNoticeTimerRef = useRef<any>(null);
  const carpoolScannerOpenRef = useRef(carpoolScannerOpen);
  const realtimeChannelRef = useRef<any>(null);
  const rtSubscribedRef = useRef(false);
  const lastTrackedSignatureRef = useRef('');
  const presencePublishedRef = useRef(false);
  const presenceWriteInFlightRef = useRef(false);
  const nearbyFetchInFlightRef = useRef(false);
  const incomingPollInFlightRef = useRef(false);
  const pendingSessionPollInFlightRef = useRef(false);
  const activeSessionPollInFlightRef = useRef(false);
  const seenExpiredRequestsRef = useRef<Set<string>>(new Set());
  const seenHandledRequestsRef = useRef<Set<string>>(new Set());
  const serverCommutersRef = useRef<RealCommuter[]>([]);
  const realtimeCommutersRef = useRef<RealCommuter[]>([]);
  const broadcastPeersRef = useRef<Map<string, any>>(new Map());

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const activeCallRef = useRef<ActiveVoiceCall | null>(null);
  const seenSignalIdsRef = useRef<Set<string>>(new Set());
  const ringtoneTimerRef = useRef<any>(null);
  const audioMeterTimerRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    carpoolScannerOpenRef.current = carpoolScannerOpen;
  }, [carpoolScannerOpen]);

  useEffect(() => {
    liveCoordsRef.current = livePickupCoords;
  }, [livePickupCoords]);

  useEffect(() => {
    livePickupRef.current = livePickupLocation;
  }, [livePickupLocation]);

  useEffect(() => {
    pendingSentRef.current = pendingSentRequestId;
  }, [pendingSentRequestId]);

  useEffect(() => {
    acceptedLinkUpRef.current = acceptedLinkUpSession;
    setConfirmHomeCancel(false);
  }, [acceptedLinkUpSession]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    locationSourceRef.current = locationSource;
  }, [locationSource]);

  useEffect(() => {
    locationStatusRef.current = locationStatus;
  }, [locationStatus]);

  useEffect(() => {
    gpsAccuracyRef.current = gpsAccuracyMeters;
  }, [gpsAccuracyMeters]);

  useEffect(() => {
    locationFixTimestampRef.current = locationFixTimestamp;
  }, [locationFixTimestamp]);

  // Stable per-tab device ID lets an in-flight Link Up session recover after a page reload.
  useEffect(() => {
    const id = sessionStorage.getItem('waygo_session_device_id') || ('dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36));
    sessionStorage.setItem('waygo_session_device_id', id);
    setDeviceId(id);
  }, []);

  // Initial load
  useEffect(() => {
    const restoredUsers = new Set<string>();
    const restoringUsers = new Set<string>();
    // Day greeting
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    setDayGreeting(`Happy ${days[new Date().getDay()]}!`);
    localStorage.removeItem('wayGoPassword');

    const loadSession = (session: any) => {
      const authUser = session?.user;
      if (!authUser) { setCurrentUser(null); setCurrentPage('login'); setCurrentRide(null); return; }
      if (restoredUsers.has(authUser.id) || restoringUsers.has(authUser.id)) return;
      restoringUsers.add(authUser.id);
      const username = authUser.user_metadata?.username || authUser.email?.split('@')[0] || 'User';
      const user: User = { id: authUser.id, username, email: authUser.email || '', emailVerified: !!authUser.email_confirmed_at };
      setCurrentUser(user);
      setCurrentPage('home');
      const restoreData = async () => {
        const previousEmail = localStorage.getItem('wayGoEmail')?.trim().toLowerCase();
        if (previousEmail && previousEmail === (authUser.email || '').toLowerCase()) {
          const legacyRecords: Array<[string, string]> = [
            ['waygo_current_ride', 'current_ride'],
            ['wayGoTimetable', 'timetable'],
          ];
          for (const [oldKey, key] of legacyRecords) {
            const oldValue = localStorage.getItem(oldKey);
            if (!oldValue) continue;
            const existing = await getUserData(authUser.id, key);
            if (existing == null) await setUserData(authUser.id, key, JSON.parse(oldValue));
            localStorage.removeItem(oldKey);
          }
          const legacySettings: Record<string, unknown> = {};
          for (const [oldKey, key, parse] of [
            ['wayGoPushNotifications', 'pushNotifs', (v: string) => v !== 'false'],
            ['wayGoScheduleNotifications', 'scheduleNotifs', (v: string) => v !== 'false'],
            ['wayGoPoolNotifications', 'poolNotifs', (v: string) => v !== 'false'],
            ['wayGoProfileVisibility', 'profileVis', (v: string) => v],
            ['wayGoEmergencyName', 'emergencyName', (v: string) => v],
            ['wayGoEmergencyEmail', 'emergencyEmail', (v: string) => v],
          ] as Array<[string, string, (value: string) => unknown]>) {
            const oldValue = localStorage.getItem(oldKey);
            if (oldValue !== null) legacySettings[key] = parse(oldValue);
          }
          if (Object.keys(legacySettings).length) {
            const existing = await getUserData<Record<string, unknown>>(authUser.id, 'settings');
            await setUserData(authUser.id, 'settings', { ...legacySettings, ...existing });
            Object.keys(legacySettings).forEach((key) => {
              const map: Record<string, string> = { pushNotifs: 'wayGoPushNotifications', scheduleNotifs: 'wayGoScheduleNotifications', poolNotifs: 'wayGoPoolNotifications', profileVis: 'wayGoProfileVisibility', emergencyName: 'wayGoEmergencyName', emergencyEmail: 'wayGoEmergencyEmail' };
              localStorage.removeItem(map[key]);
            });
          }
          localStorage.removeItem('wayGoEmail');
          localStorage.removeItem('wayGoUsername');
        }
        localStorage.removeItem('wayGoPassword');
        const ride = await getUserData<RideBooking>(authUser.id, 'current_ride');
        setCurrentRide(ride);
      };
      restoreData()
        .then(() => restoredUsers.add(authUser.id))
        .catch((err) => console.error('Could not load or migrate account data:', err))
        .finally(() => restoringUsers.delete(authUser.id));
    };
    supabase.auth.getSession().then(({ data }) => loadSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => loadSession(session), 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Safe JSON helper
  const safeJson = async (res: Response) => {
    try {
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // Merge server Express commuters + Supabase Realtime Presence/Broadcast peers (deduplicated by deviceId & real email)
  const mergeAndSetNearbyCommuters = useCallback(() => {
    const cleanMyEmail = (currentUserRef.current?.email || '').trim().toLowerCase();
    const mergedByDevice = new Map<string, RealCommuter>();
    for (const c of serverCommutersRef.current) {
      mergedByDevice.set(c.deviceId, c);
    }
    for (const c of realtimeCommutersRef.current) {
      mergedByDevice.set(c.deviceId, c);
    }

    const finalList: RealCommuter[] = [];
    const seenRealEmails = new Set<string>();
    for (const c of Array.from(mergedByDevice.values()).sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm)) {
      if (c.deviceId === deviceId) continue;
      const peerEmail = (c.email || '').trim().toLowerCase();
      if (cleanMyEmail && peerEmail && peerEmail === cleanMyEmail) continue;
      const isTestEntry = c.deviceId.startsWith('dev_real_user_') || c.deviceId.startsWith('test_');
      if (!isTestEntry && peerEmail) {
        if (seenRealEmails.has(peerEmail)) continue;
        seenRealEmails.add(peerEmail);
      }
      finalList.push(c);
    }

    setNearbyCommuters(finalList);
  }, [deviceId]);

  // Re-evaluate Supabase Realtime presence + broadcast state against latest coords
  const syncRealtimePresenceState = useCallback(() => {
    const ch = realtimeChannelRef.current;
    const { lat, lng } = liveCoordsRef.current;
    const email = currentUserRef.current?.email || '';
    const state = ch ? ch.presenceState() : {};
    const { withinRange, outOfRange } = extractRealtimePeerStatuses(
      state,
      broadcastPeersRef.current,
      deviceId,
      email,
      lat,
      lng,
      DETECTION_RADIUS_KM,
      gpsAccuracyRef.current || (locationSourceRef.current === 'ip' ? 5000 : 0)
    );
    realtimeCommutersRef.current = withinRange;
    setOutOfRangeCommuters(outOfRange);
    mergeAndSetNearbyCommuters();
  }, [deviceId, mergeAndSetNearbyCommuters]);

  const reverseGeocodeCoords = useCallback(async (lat: number, lng: number, prefix = 'My GPS') => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await safeJson(res);
      if (data && data.display_name) {
        const shortAddr = data.address?.road
          ? `${data.address.road}, ${data.address.suburb || data.address.city || ''}`
          : data.display_name.split(',').slice(0, 3).join(', ');
        setLivePickupLocation(shortAddr);
        return;
      }
    } catch {
      // ignore
    }
    setLivePickupLocation(`${prefix} (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
  }, []);

  const fallbackToIpLocation = useCallback(async () => {
    const providers = [
      async () => {
        const response = await fetch('https://ipwho.is/');
        const data = await safeJson(response);
        if (!data || data.success === false) return null;
        return { lat: Number(data.latitude), lng: Number(data.longitude), label: [data.city, data.region].filter(Boolean).join(', ') };
      },
      async () => {
        const response = await fetch('https://get.geojs.io/v1/ip/geo.json');
        const data = await safeJson(response);
        return { lat: Number(data?.latitude), lng: Number(data?.longitude), label: [data?.city, data?.region].filter(Boolean).join(', ') };
      },
      async () => {
        const response = await fetch('https://ipapi.co/json/');
        const data = await safeJson(response);
        return { lat: Number(data?.latitude), lng: Number(data?.longitude), label: [data?.city, data?.region].filter(Boolean).join(', ') };
      }
    ];
    for (const provider of providers) {
      try {
        const point = await provider();
        if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) continue;
        setLivePickupCoords({ lat: point.lat, lng: point.lng });
        setGpsAccuracyMeters(null);
        setLocationSource('ip');
        setLocationFixTimestamp(Date.now());
        setLocationStatus('degraded');
        setLivePickupLocation(`${point.label || 'Network location'} (Approximate)`);
        return;
      } catch {
        // Try the next approximate network location provider.
      }
    }
    setLocationSource('default');
    setGpsAccuracyMeters(null);
    setLocationFixTimestamp(null);
    setLocationStatus('unavailable');
    setLocationError(locationStatusRef.current === 'permission_denied' ? 'blocked' : 'unavailable');
    setLivePickupLocation('Location unavailable — set an area manually');
  }, []);

  const locateUserPosition = useCallback((highPrecisionCalibration = false) => {
    setLocatingUser(true);
    setCalibratingGps(highPrecisionCalibration);
    locationManagerRef.current?.refresh();
  }, []);
  const handleSetCustomLocation = useCallback((lat: number, lng: number, label: string) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setLocationError('unavailable');
      return;
    }
    locationManagerRef.current?.stop();
    setLivePickupCoords({ lat, lng });
    setGpsAccuracyMeters(null);
    setLivePickupLocation(label);
    setLocationSource('manual');
    setLocationFixTimestamp(Date.now());
    setLocationStatus('active');
    setLocationError(null);
  }, []);

  const buildMyPresencePayload = useCallback(() => {
    const user = currentUserRef.current;
    if (!deviceId || !user) return null;
    if (locationSourceRef.current === 'default') return null;
    if (locationSourceRef.current === 'gps' && (!locationFixTimestampRef.current || Date.now() - locationFixTimestampRef.current > 90_000)) return null;
    return {
      deviceId,
      username: user.username || 'Live Commuter',
      email: (user.email || '').trim().toLowerCase(),
      lastSeenAt: Date.now(),
      avatar: 'ðŸ‘¤',
      pickup: livePickupRef.current,
      drop: FIXED_DEST_NAME,
      pickupCoords: liveCoordsRef.current,
      dropCoords: FIXED_DEST_COORDS,
      departTime: 'Leaving now / 10 mins',
      vehiclePreference: 'cab' as const,
      coordsAccuracyMeters: gpsAccuracyRef.current,
      locationSource: locationSourceRef.current,
      locationStatus: locationStatusRef.current,
      locationFixTimestamp: locationFixTimestampRef.current
    };
  }, [deviceId]);

  const broadcastMyPresence = useCallback(async (forceRealtimeTrack = false) => {
    if (presenceWriteInFlightRef.current) return;
    const payload = buildMyPresencePayload();
    if (!payload) {
      if (presencePublishedRef.current) {
        presencePublishedRef.current = false;
        try { await realtimeChannelRef.current?.untrack(); } catch { /* channel may be reconnecting */ }
        carpoolFetch(`/api/carpool/presence/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
          .catch((error) => console.warn('Could not clear stale location presence:', error?.message || 'network error'));
      }
      return;
    }
    presenceWriteInFlightRef.current = true;

    // 1. Track on Supabase Realtime only once SUBSCRIBED and only when state changed (avoids presence churn)
    if (realtimeChannelRef.current && rtSubscribedRef.current) {
      const sig = `${payload.deviceId}|${payload.email}|${payload.username}|${payload.pickupCoords.lat.toFixed(6)}|${payload.pickupCoords.lng.toFixed(6)}|${payload.coordsAccuracyMeters ?? ''}|${payload.locationSource ?? ''}|${payload.pickup}`;
      if (forceRealtimeTrack || sig !== lastTrackedSignatureRef.current) {
        lastTrackedSignatureRef.current = sig;
        try {
          await realtimeChannelRef.current.track(payload);
        } catch {
          // ignore if reconnecting
        }
      }
    }

    // 2. Express presence heartbeat
    try {
      const response = await carpoolFetch('/api/carpool/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Presence heartbeat failed (${response.status}).`);
      presencePublishedRef.current = true;
    } catch (error: any) {
      console.warn('Presence heartbeat failed:', error?.message || 'network error');
    } finally {
      presenceWriteInFlightRef.current = false;
    }
  }, [buildMyPresencePayload]);

  const broadcastScannerPing = useCallback(async () => {
    const payload = buildMyPresencePayload();
    if (!payload || !realtimeChannelRef.current || !rtSubscribedRef.current) return;
    try {
      await realtimeChannelRef.current.send({
        type: 'broadcast',
        event: 'scanner_ping',
        payload: { ...payload, updatedAt: Date.now() }
      });
    } catch {
      // ignore
    }
  }, [buildMyPresencePayload]);

  const fetchNearbyWithin3Km = useCallback(async () => {
    if (!deviceId || nearbyFetchInFlightRef.current) return;
    if (locationSourceRef.current === 'default' || (locationSourceRef.current === 'gps' && (!locationFixTimestampRef.current || Date.now() - locationFixTimestampRef.current > 90_000))) {
      serverCommutersRef.current = [];
      realtimeCommutersRef.current = [];
      mergeAndSetNearbyCommuters();
      return;
    }
    nearbyFetchInFlightRef.current = true;
    syncRealtimePresenceState();
    try {
      const url = `/api/carpool/nearby?radius=${DETECTION_RADIUS_KM}&deviceId=${encodeURIComponent(deviceId)}&destLat=${FIXED_DEST_COORDS.lat}&destLng=${FIXED_DEST_COORDS.lng}`;
      const res = await carpoolFetch(url);
      const data = await safeJson(res);
      if (data && data.success && Array.isArray(data.commuters)) {
        serverCommutersRef.current = data.commuters;
        mergeAndSetNearbyCommuters();
      } else if (!res.ok) throw new Error(`Radar request failed (${res.status}).`);
    } catch (error: any) {
      serverCommutersRef.current = [];
      mergeAndSetNearbyCommuters();
      console.warn('Nearby radar refresh failed:', error?.message || 'network error');
    } finally {
      nearbyFetchInFlightRef.current = false;
    }
  }, [deviceId, mergeAndSetNearbyCommuters, syncRealtimePresenceState]);

  const handleManualScanRefresh = useCallback(async () => {
    await broadcastMyPresence(true);
    await broadcastScannerPing();
    await fetchNearbyWithin3Km();
  }, [broadcastMyPresence, broadcastScannerPing, fetchNearbyWithin3Km]);

  const checkIncomingLinkUps = useCallback(async () => {
    if (!deviceId || incomingPollInFlightRef.current) return;
    incomingPollInFlightRef.current = true;
    try {
      const res = await carpoolFetch(`/api/carpool/linkup/incoming?deviceId=${encodeURIComponent(deviceId)}`);
      const data = await safeJson(res);
      if (!res.ok || !data?.success) throw new Error(data?.message || `Incoming request check failed (${res.status}).`);
      const expired = Array.isArray(data.expired) ? data.expired.find((request: any) => request?.id && !seenExpiredRequestsRef.current.has(request.id)) : null;
      if (expired) {
        seenExpiredRequestsRef.current.add(expired.id);
        showLinkupNotice('A Link Up request expired before you could respond.');
      }
      if (data.active && !acceptedLinkUpRef.current) {
        setAcceptedLinkUpSession(data.active);
        setCarpoolScannerOpen(true);
      }
      if (data.outgoing?.id && !pendingSentRef.current) setPendingSentRequestId(data.outgoing.id);
      const handled = Array.isArray(data.handled) ? data.handled : [];
      const accepted = handled.find((session: any) => session?.status === 'accepted');
      if (accepted && !acceptedLinkUpRef.current) {
        setAcceptedLinkUpSession(accepted);
        setCarpoolScannerOpen(true);
      }
      const declined = handled.find((session: any) => session?.status === 'declined' && !seenHandledRequestsRef.current.has(`${session.id}:declined`));
      if (declined) {
        seenHandledRequestsRef.current.add(`${declined.id}:declined`);
        showLinkupNotice(`${declined.fromUser?.username || 'The sender'} declined the Link Up request.`);
      }
      const cancelled = handled.find((session: any) => session?.status === 'cancelled' && !seenHandledRequestsRef.current.has(`${session.id}:cancelled`));
      if (cancelled) {
        seenHandledRequestsRef.current.add(`${cancelled.id}:cancelled`);
        showLinkupNotice(`${cancelled.cancelledBy || 'The other commuter'} cancelled the Link Up request.`);
      }
      const completed = handled.find((session: any) => session?.status === 'completed' && !seenHandledRequestsRef.current.has(`${session.id}:completed`));
      if (completed) {
        seenHandledRequestsRef.current.add(`${completed.id}:completed`);
        showLinkupNotice('The Link Up session has ended.');
      }
      if (data && data.success && Array.isArray(data.incoming) && data.incoming.length > 0) {
        setIncomingLinkUp((previous: any) => previous?.id === data.incoming[0].id ? previous : data.incoming[0]);
      } else {
        setIncomingLinkUp(null);
      }
    } catch (error: any) {
      console.warn('Incoming Link Up refresh failed:', error?.message || 'network error');
    } finally {
      incomingPollInFlightRef.current = false;
    }
  }, [deviceId]);

  const removeMyPresence = useCallback((idToClear?: string) => {
    const targetId = idToClear || deviceId;
    if (!targetId) return;
    rtSubscribedRef.current = false;
    lastTrackedSignatureRef.current = '';
    if (realtimeChannelRef.current) {
      try {
        realtimeChannelRef.current.untrack();
      } catch {
        // ignore
      }
    }
    carpoolFetch(`/api/carpool/presence/${encodeURIComponent(targetId)}`, { method: 'DELETE' }).catch(() => {});
  }, [deviceId]);

  const sendRealtimeBroadcast = useCallback(async (event: string, payload: any) => {
    if (!realtimeChannelRef.current) return;
    try {
      await realtimeChannelRef.current.send({
        type: 'broadcast',
        event,
        payload
      });
    } catch {
      // ignore
    }
  }, []);

  // ========================================================
  // IN-WEBSITE WEBRTC VOICE CALLING (NO PHONE NUMBERS)
  // ========================================================
  const cleanupWebRtcResources = useCallback(() => {
    if (audioMeterTimerRef.current) {
      clearInterval(audioMeterTimerRef.current);
      audioMeterTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      remoteStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingIceRef.current = [];
    setCallAudioLevel(0.2);
  }, []);

  const sendCallSignal = useCallback(
    async (
      toDeviceId: string,
      kind: CallSignalKind,
      callId: string,
      extra?: Partial<CallSignalPayload>
    ) => {
      const user = currentUserRef.current;
      const payload: CallSignalPayload = {
        signalId: 'sig_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36),
        callId,
        kind,
        fromDeviceId: deviceId,
        fromUser: {
          username: user?.username || 'WayGo Commuter',
          email: (user?.email || '').trim().toLowerCase()
        },
        toDeviceId,
        sentAt: Date.now(),
        ...extra
      };

      await sendRealtimeBroadcast('call_signal', payload);
      carpoolFetch('/api/carpool/call/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    },
    [deviceId, sendRealtimeBroadcast]
  );

  const setupAudioLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      if (audioMeterTimerRef.current) clearInterval(audioMeterTimerRef.current);
      audioMeterTimerRef.current = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((sum, v) => sum + v, 0) / Math.max(1, dataArray.length);
        setCallAudioLevel(Math.min(1, Math.max(0.18, avg / 95)));
      }, 120);
    } catch {
      // ignore if audio context unavailable
    }
  }, []);

  const createConfiguredPeerConnection = useCallback(
    (peerDeviceId: string, callId: string) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      pc.onicecandidate = (evt) => {
        if (evt.candidate) {
          sendCallSignal(peerDeviceId, 'call_ice', callId, {
            candidate: evt.candidate.toJSON ? evt.candidate.toJSON() : evt.candidate
          });
        }
      };

      pc.ontrack = (evt) => {
        const [stream] = evt.streams;
        const incomingStream = stream || new MediaStream([evt.track]);
        remoteStreamRef.current = incomingStream;
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = incomingStream;
          remoteAudioRef.current.muted = speakerMuted;
          remoteAudioRef.current.play().catch(() => {});
        }
        setupAudioLevelMeter(incomingStream);
        setActiveCall((prev) =>
          prev && prev.callId === callId
            ? { ...prev, status: 'connected', startedAt: prev.startedAt || Date.now() }
            : prev
        );
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === 'connected') {
          setActiveCall((prev) =>
            prev && prev.callId === callId
              ? { ...prev, status: 'connected', startedAt: prev.startedAt || Date.now() }
              : prev
          );
        } else if (st === 'failed') {
          cleanupWebRtcResources();
          setActiveCall((prev) =>
            prev && prev.callId === callId
              ? { ...prev, status: 'error', errorMessage: 'Audio connection failed on this network.' }
              : prev
          );
        } else if (st === 'disconnected' || st === 'closed') {
          const cur = activeCallRef.current;
          if (cur && cur.callId === callId && cur.status === 'connected') {
            cleanupWebRtcResources();
            setActiveCall({ ...cur, status: 'ended', errorMessage: 'Call disconnected' });
          }
        }
      };

      return pc;
    },
    [cleanupWebRtcResources, sendCallSignal, setupAudioLevelMeter, speakerMuted]
  );

  const handleIncomingCallSignal = useCallback(
    async (signal: CallSignalPayload) => {
      if (!signal || !signal.signalId || !signal.callId || !signal.kind) return;
      if (signal.toDeviceId !== deviceId) return;
      if (seenSignalIdsRef.current.has(signal.signalId)) return;
      seenSignalIdsRef.current.add(signal.signalId);

      const cur = activeCallRef.current;

      if (signal.kind === 'call_invite') {
        if (cur && cur.status !== 'idle' && cur.status !== 'ended' && cur.status !== 'error') {
          sendCallSignal(signal.fromDeviceId, 'call_busy', signal.callId, {
            reason: 'Partner is already on another call'
          });
          return;
        }
        pendingIceRef.current = [];
        setMicMuted(false);
        setSpeakerMuted(false);
        setActiveCall({
          callId: signal.callId,
          peerDeviceId: signal.fromDeviceId,
          peerUsername: signal.fromUser?.username || 'Linked Commuter',
          peerEmail: signal.fromUser?.email,
          direction: 'incoming',
          status: 'ringing_in',
          remoteOfferSdp: signal.sdp
        });
        return;
      }

      if (!cur || cur.callId !== signal.callId) return;

      if (signal.kind === 'call_answer' && signal.sdp && pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          for (const candidate of pendingIceRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
          pendingIceRef.current = [];
          setActiveCall((prev) =>
            prev && prev.callId === signal.callId ? { ...prev, status: 'connecting' } : prev
          );
        } catch {
          cleanupWebRtcResources();
          setActiveCall((prev) =>
            prev ? { ...prev, status: 'error', errorMessage: 'Could not finalize audio handshake.' } : null
          );
        }
        return;
      }

      if (signal.kind === 'call_ice' && signal.candidate) {
        if (pcRef.current && pcRef.current.remoteDescription) {
          pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
        } else {
          pendingIceRef.current.push(signal.candidate);
        }
        return;
      }

      if (signal.kind === 'call_reject' || signal.kind === 'call_busy' || signal.kind === 'call_end') {
        cleanupWebRtcResources();
        const reasonText =
          signal.kind === 'call_reject'
            ? 'Partner declined the call'
            : signal.kind === 'call_busy'
            ? 'Partner is busy on another call'
            : 'Partner ended the call';
        setActiveCall((prev) =>
          prev && prev.callId === signal.callId ? { ...prev, status: 'ended', errorMessage: reasonText } : prev
        );
      }
    },
    [cleanupWebRtcResources, deviceId, sendCallSignal]
  );

  const startInWebsiteCall = useCallback(
    async (partner: { deviceId: string; username: string; email?: string }) => {
      if (!deviceId || !partner?.deviceId) return;
      const callId = 'CALL-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      cleanupWebRtcResources();
      setMicMuted(false);
      setSpeakerMuted(false);
      setActiveCall({
        callId,
        peerDeviceId: partner.deviceId,
        peerUsername: partner.username,
        peerEmail: partner.email,
        direction: 'outgoing',
        status: 'calling'
      });

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Microphone API is unavailable in this browser context.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        localStreamRef.current = stream;

        const pc = createConfiguredPeerConnection(partner.deviceId, callId);
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await sendCallSignal(partner.deviceId, 'call_invite', callId, {
          sdp: { type: offer.type, sdp: offer.sdp }
        });
      } catch (err: any) {
        cleanupWebRtcResources();
        const msg =
          err?.name === 'NotAllowedError'
            ? 'Microphone permission blocked. Allow mic access in a full tab to call.'
            : err?.message || 'Unable to access microphone for voice call.';
        setActiveCall({
          callId,
          peerDeviceId: partner.deviceId,
          peerUsername: partner.username,
          peerEmail: partner.email,
          direction: 'outgoing',
          status: 'error',
          errorMessage: msg
        });
      }
    },
    [cleanupWebRtcResources, createConfiguredPeerConnection, deviceId, sendCallSignal]
  );

  const acceptIncomingCall = useCallback(async () => {
    const cur = activeCallRef.current;
    if (!cur || cur.status !== 'ringing_in' || !cur.remoteOfferSdp) return;

    setActiveCall({ ...cur, status: 'connecting' });
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone API is unavailable in this browser context.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localStreamRef.current = stream;

      const pc = createConfiguredPeerConnection(cur.peerDeviceId, cur.callId);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(cur.remoteOfferSdp));
      for (const candidate of pendingIceRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      pendingIceRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await sendCallSignal(cur.peerDeviceId, 'call_answer', cur.callId, {
        sdp: { type: answer.type, sdp: answer.sdp }
      });
    } catch (err: any) {
      cleanupWebRtcResources();
      await sendCallSignal(cur.peerDeviceId, 'call_reject', cur.callId, { reason: 'Microphone unavailable' });
      const msg =
        err?.name === 'NotAllowedError'
          ? 'Microphone permission blocked. Allow mic access in a full tab to answer.'
          : err?.message || 'Could not access microphone.';
      setActiveCall({ ...cur, status: 'error', errorMessage: msg });
    }
  }, [cleanupWebRtcResources, createConfiguredPeerConnection, sendCallSignal]);

  const declineIncomingCall = useCallback(() => {
    const cur = activeCallRef.current;
    if (!cur) return;
    sendCallSignal(cur.peerDeviceId, 'call_reject', cur.callId);
    cleanupWebRtcResources();
    setActiveCall(null);
  }, [cleanupWebRtcResources, sendCallSignal]);

  const endActiveCall = useCallback(() => {
    const cur = activeCallRef.current;
    if (cur && cur.status !== 'ended' && cur.status !== 'error') {
      sendCallSignal(cur.peerDeviceId, 'call_end', cur.callId);
    }
    cleanupWebRtcResources();
    setActiveCall(null);
  }, [cleanupWebRtcResources, sendCallSignal]);

  const toggleMicMute = useCallback(() => {
    setMicMuted((prev) => {
      const next = !prev;
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = !next;
        });
      }
      return next;
    });
  }, []);

  const toggleSpeakerMute = useCallback(() => {
    setSpeakerMuted((prev) => {
      const next = !prev;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  // Gentle Web Audio chime while ringing or dialing
  useEffect(() => {
    if (ringtoneTimerRef.current) {
      clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
    if (!activeCall || (activeCall.status !== 'ringing_in' && activeCall.status !== 'calling')) {
      return;
    }

    const playTone = () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = activeCall.status === 'ringing_in' ? 587.33 : 440;
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.38);
        setTimeout(() => ctx.close().catch(() => {}), 500);
      } catch {
        // ignore autoplay restrictions
      }
    };

    playTone();
    ringtoneTimerRef.current = setInterval(playTone, 2400);
    return () => {
      if (ringtoneTimerRef.current) {
        clearInterval(ringtoneTimerRef.current);
        ringtoneTimerRef.current = null;
      }
    };
  }, [activeCall?.callId, activeCall?.status]);

  // Auto-dismiss ended call banner after 3 seconds
  useEffect(() => {
    if (!activeCall || activeCall.status !== 'ended') return;
    const t = setTimeout(() => {
      setActiveCall((cur) => (cur && cur.callId === activeCall.callId && cur.status === 'ended' ? null : cur));
    }, 3000);
    return () => clearTimeout(t);
  }, [activeCall?.callId, activeCall?.status]);

  const showLinkupNotice = useCallback((msg: string) => {
    if (linkupNoticeTimerRef.current) {
      clearTimeout(linkupNoticeTimerRef.current);
    }
    setLinkupNotice(msg);
    linkupNoticeTimerRef.current = setTimeout(() => {
      setLinkupNotice(null);
      linkupNoticeTimerRef.current = null;
    }, 6500);
  }, []);

  const handleRemoteLinkUpCancelled = useCallback(
    (payload: {
      requestId?: string;
      partnerDeviceId?: string;
      cancelledByDeviceId?: string;
      cancelledByUsername?: string;
    }) => {
      if (!payload) return;
      if (payload.cancelledByDeviceId && payload.cancelledByDeviceId === deviceId) return;

      const curSession = acceptedLinkUpRef.current;
      const matchesActive =
        Boolean(curSession) &&
        ((payload.requestId && curSession.id === payload.requestId) ||
          (payload.partnerDeviceId && payload.partnerDeviceId === deviceId));

      if (matchesActive) {
        const curCall = activeCallRef.current;
        if (
          curCall &&
          (!payload.cancelledByDeviceId || curCall.peerDeviceId === payload.cancelledByDeviceId)
        ) {
          endActiveCall();
        }
        setAcceptedLinkUpSession(null);
        setPendingSentRequestId(null);
        showLinkupNotice(`${payload.cancelledByUsername || 'Your partner'} cancelled the link up session.`);
      }

      if (payload.requestId && pendingSentRef.current === payload.requestId) {
        setPendingSentRequestId(null);
        showLinkupNotice(`${payload.cancelledByUsername || 'The sender'} cancelled the Link Up request.`);
      }

      setIncomingLinkUp((prev: any) =>
        prev && payload.requestId && prev.id === payload.requestId ? null : prev
      );
    },
    [deviceId, endActiveCall, showLinkupNotice]
  );

  // Realtime broadcasts and authenticated polling for current carpool state.
  useEffect(() => {
    if (currentPage !== 'home' || !currentUser || !deviceId) {
      return;
    }

    let disposed = false;
    if (!locationManagerRef.current) locationManagerRef.current = new BrowserLocationManager();
    const unsubscribeLocation = locationManagerRef.current.subscribe((state) => {
      setLocationStatus(state.status);
      setLocationError(state.status === 'permission_denied' ? 'blocked' : state.status === 'unavailable' ? 'unavailable' : null);
      if ((state.status === 'permission_denied' || state.status === 'unavailable') && locationSourceRef.current !== 'manual') {
        setLocatingUser(false);
        setCalibratingGps(false);
        setLocationSource('default');
        setGpsAccuracyMeters(null);
        setLocationFixTimestamp(null);
        fallbackToIpLocation();
      } else if (state.fix) {
        setLivePickupCoords({ lat: state.fix.lat, lng: state.fix.lng });
        setGpsAccuracyMeters(state.fix.accuracy);
        setLocationSource('gps');
        setLocationFixTimestamp(state.fix.timestamp);
        setLocationError(null);
        setLocatingUser(false);
        setCalibratingGps(false);
        reverseGeocodeCoords(state.fix.lat, state.fix.lng, 'Live GPS');
      } else if (state.status === 'acquiring' && locationSourceRef.current === 'gps' && (!locationFixTimestampRef.current || Date.now() - locationFixTimestampRef.current > 90_000)) {
        setLocationSource('default');
        setGpsAccuracyMeters(null);
        setLocationFixTimestamp(null);
      }
    });
    locationManagerRef.current.start();
    // 1. Ensure clean channel before connecting to global Supabase Realtime channel
    const existingChannels = supabase
      .getChannels()
      .filter((ch) => ch.topic === `realtime:${SUPABASE_CARPOOL_CHANNEL}`);
    existingChannels.forEach((ch) => {
      supabase.removeChannel(ch).catch(() => {});
    });

    rtSubscribedRef.current = false;
    lastTrackedSignatureRef.current = '';

    const rtChannel = supabase.channel(SUPABASE_CARPOOL_CHANNEL, {
      config: {
        presence: { key: deviceId },
        broadcast: { self: false }
      }
    });
    realtimeChannelRef.current = rtChannel;

    rtChannel
      .on('presence', { event: 'sync' }, () => {
        if (!disposed) syncRealtimePresenceState();
      })
      .on('presence', { event: 'join' }, () => {
        if (!disposed) syncRealtimePresenceState();
      })
      .on('presence', { event: 'leave' }, (payload: any) => {
        if (disposed) return;
        if (payload?.key) {
          broadcastPeersRef.current.delete(payload.key);
        }
        if (Array.isArray(payload?.leftPresences)) {
          for (const p of payload.leftPresences) {
            if (p?.deviceId) broadcastPeersRef.current.delete(p.deviceId);
          }
        }
        syncRealtimePresenceState();
      })
      .on('broadcast', { event: 'scanner_ping' }, (msg: any) => {
        if (disposed) return;
        const peer = msg?.payload;
        if (!peer?.deviceId || peer.deviceId === deviceId) return;
        broadcastPeersRef.current.set(peer.deviceId, { ...peer, receivedAt: Date.now() });
        syncRealtimePresenceState();
        // Reply with our latest coordinates & profile so the scanning device sees us immediately
        const myPayload = buildMyPresencePayload();
        if (myPayload && rtSubscribedRef.current) {
          rtChannel.send({
            type: 'broadcast',
            event: 'scanner_pong',
            payload: { ...myPayload, toDeviceId: peer.deviceId, updatedAt: Date.now() }
          }).catch(() => {});
        }
      })
      .on('broadcast', { event: 'scanner_pong' }, (msg: any) => {
        if (disposed) return;
        const peer = msg?.payload;
        if (!peer?.deviceId || peer.deviceId === deviceId) return;
        if (peer.toDeviceId && peer.toDeviceId !== deviceId) return;
        broadcastPeersRef.current.set(peer.deviceId, { ...peer, receivedAt: Date.now() });
        syncRealtimePresenceState();
      })
      .on('broadcast', { event: 'linkup_request' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.toDeviceId === deviceId && payload?.session) {
          setIncomingLinkUp({ ...payload.session, viaRealtime: true });
        }
      })
      .on('broadcast', { event: 'linkup_response' }, (msg: any) => {
        const payload = msg?.payload;
        const session = payload?.session;
        if (!session) return;
        if (payload?.toDeviceId !== deviceId && session.fromDeviceId !== deviceId) return;
        if (session.status === 'accepted') {
          setAcceptedLinkUpSession(session);
          setPendingSentRequestId(null);
          setCarpoolScannerOpen(true);
        } else if (session.status === 'declined') {
          showLinkupNotice(`${session.toUser?.username || 'The commuter'} declined the link up request.`);
          setPendingSentRequestId(null);
        }
      })
      .on('broadcast', { event: 'linkup_cancelled' }, (msg: any) => {
        if (!disposed && msg?.payload) {
          handleRemoteLinkUpCancelled(msg.payload);
        }
      })
      .on('broadcast', { event: 'call_signal' }, (msg: any) => {
        if (!disposed && msg?.payload) {
          handleIncomingCallSignal(msg.payload);
        }
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          rtSubscribedRef.current = true;
          broadcastMyPresence(true);
          broadcastScannerPing();
          syncRealtimePresenceState();
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          rtSubscribedRef.current = false;
        }
      });

    // 2. Immediate Express broadcast & scan
    broadcastMyPresence();
    fetchNearbyWithin3Km();
    checkIncomingLinkUps();

    // Five-second radar/recovery poll; refresh presence every third tick.
    let tickCount = 0;
    const heartbeatTimer = setInterval(() => {
      tickCount++;
      if (tickCount % 3 === 0) broadcastMyPresence(tickCount % 6 === 0);
      if (carpoolScannerOpenRef.current && tickCount % 3 === 0) {
        broadcastScannerPing();
      }
      fetchNearbyWithin3Km();
      checkIncomingLinkUps();

      carpoolFetch(`/api/carpool/call/pending?deviceId=${encodeURIComponent(deviceId)}`)
        .then((r) => safeJson(r))
        .then((data) => {
          if (data && data.success && Array.isArray(data.signals)) {
            for (const sig of data.signals) {
              handleIncomingCallSignal(sig);
            }
          }
        })
        .catch(() => {});

      const pendingId = pendingSentRef.current;
      if (pendingId && !pendingSessionPollInFlightRef.current) {
        pendingSessionPollInFlightRef.current = true;
        carpoolFetch(`/api/carpool/linkup/session/${pendingId}`)
          .then(async (r) => ({ ok: r.ok, status: r.status, data: await safeJson(r) }))
          .then(({ ok, status, data }) => {
            if (!ok || !data?.success) {
              if (status === 404) {
                setPendingSentRequestId(null);
                showLinkupNotice('This Link Up request expired or is no longer available.');
              }
              return;
            }
            if (data && data.success && data.session) {
              if (data.session.status === 'accepted') {
                setAcceptedLinkUpSession(data.session);
                setPendingSentRequestId(null);
                setCarpoolScannerOpen(true);
              } else if (data.session.status === 'declined') {
                showLinkupNotice(`${data.session.toUser?.username || 'The commuter'} declined this link up request.`);
                setPendingSentRequestId(null);
              } else if (data.session.status === 'expired') {
                showLinkupNotice('The Link Up request expired before it was answered.');
                setPendingSentRequestId(null);
              } else if (data.session.status === 'cancelled') {
                handleRemoteLinkUpCancelled({
                  requestId: data.session.id,
                  cancelledByUsername: data.session.cancelledBy
                });
              }
            }
          })
          .catch((error) => {
            console.warn('Could not refresh Link Up request status:', error?.message || 'network error');
            showLinkupNotice('Connection interrupted. WayGo is retrying the Link Up status check.');
          })
          .finally(() => {
            pendingSessionPollInFlightRef.current = false;
          });
      }

      const activeId = acceptedLinkUpRef.current?.id;
      if (activeId && !activeSessionPollInFlightRef.current) {
        activeSessionPollInFlightRef.current = true;
        carpoolFetch(`/api/carpool/linkup/session/${activeId}`)
          .then((r) => safeJson(r))
          .then((data) => {
            if (data && data.success && data.session && ['cancelled', 'completed'].includes(data.session.status)) {
              if (data.session.status === 'cancelled') {
                handleRemoteLinkUpCancelled({
                  requestId: data.session.id,
                  cancelledByUsername: data.session.cancelledBy
                });
              } else if (acceptedLinkUpRef.current?.id === data.session.id) {
                setAcceptedLinkUpSession(null);
                showLinkupNotice('This Link Up session has ended.');
              }
            }
          })
          .catch((error) => console.warn('Could not refresh active Link Up session:', error?.message || 'network error'))
          .finally(() => {
            activeSessionPollInFlightRef.current = false;
          });
      }
    }, 5000);

    const handleReconnect = () => {
      broadcastMyPresence(true);
      fetchNearbyWithin3Km();
      checkIncomingLinkUps();
    };
    window.addEventListener('online', handleReconnect);
    window.addEventListener('focus', handleReconnect);

    const handleBeforeUnload = () => {
      carpoolFetch('/api/carpool/presence/leave', {
        method: 'POST', body: JSON.stringify({ deviceId }), keepalive: true
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      disposed = true;
      unsubscribeLocation();
      locationManagerRef.current?.stop();
      rtSubscribedRef.current = false;
      clearInterval(heartbeatTimer);

      window.removeEventListener('online', handleReconnect);
      window.removeEventListener('focus', handleReconnect);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (realtimeChannelRef.current === rtChannel) {
        realtimeChannelRef.current = null;
      }
      try {
        rtChannel.untrack();
      } catch {
        // ignore
      }
      supabase.removeChannel(rtChannel);
      removeMyPresence(deviceId);
    };
  }, [
    currentPage,
    currentUser?.email,
    currentUser?.username,
    deviceId,
    locateUserPosition,
    fallbackToIpLocation,
    reverseGeocodeCoords,
    buildMyPresencePayload,
    broadcastMyPresence,
    broadcastScannerPing,
    fetchNearbyWithin3Km,
    checkIncomingLinkUps,
    removeMyPresence,
    syncRealtimePresenceState,
    handleIncomingCallSignal,
    handleRemoteLinkUpCancelled,
    showLinkupNotice
  ]);

  // Re-broadcast & ping immediately whenever GPS coords, accuracy, or pickup name updates OR scanner modal opens while on Home
  useEffect(() => {
    if (currentPage === 'home' && currentUser && deviceId) {
      broadcastMyPresence();
      if (carpoolScannerOpen) {
        broadcastScannerPing();
      }
      syncRealtimePresenceState();
      fetchNearbyWithin3Km();
    }
  }, [
    livePickupCoords.lat,
    livePickupCoords.lng,
    gpsAccuracyMeters,
    locationSource,
    livePickupLocation,
    carpoolScannerOpen,
    currentPage,
    currentUser,
    deviceId,
    broadcastMyPresence,
    broadcastScannerPing,
    syncRealtimePresenceState,
    fetchNearbyWithin3Km
  ]);

  const handleAcceptIncomingLinkUp = async () => {
    if (!incomingLinkUp) return;
    const responderEmail = currentUser?.email || '';
    try {
      const res = await carpoolFetch('/api/carpool/linkup/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: incomingLinkUp.id,
          deviceId,
          action: 'accepted',
          responderEmail,
          sessionFallback: incomingLinkUp
        })
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.success || !data.session) throw new Error(data?.message || 'Could not accept the link up.');
      const acceptedSession = data.session;

      await sendRealtimeBroadcast('linkup_response', {
        toDeviceId: incomingLinkUp.fromDeviceId,
        session: acceptedSession
      });

      setAcceptedLinkUpSession(acceptedSession);
      setIncomingLinkUp(null);
      setCarpoolScannerOpen(true);
    } catch (error: any) {
      alert(error?.message || 'Could not accept the link up. Please try again.');
    }
  };

  const handleDeclineIncomingLinkUp = async () => {
    if (!incomingLinkUp) return;
    const declinedSession = { ...incomingLinkUp, status: 'declined' };
    try {
      const response = await carpoolFetch('/api/carpool/linkup/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: incomingLinkUp.id,
          deviceId,
          action: 'declined',
          sessionFallback: incomingLinkUp
        })
      });
      const result = await safeJson(response);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Could not decline the link up.');
    } catch (error: any) {
      alert(error?.message || 'Could not decline the link up. Please try again.');
      return;
    }
    await sendRealtimeBroadcast('linkup_response', {
      toDeviceId: incomingLinkUp.fromDeviceId,
      session: declinedSession
    });
    setIncomingLinkUp(null);
  };

  const handleCancelAcceptedLinkUp = useCallback(async () => {
    const session = acceptedLinkUpRef.current;
    if (!session) return;

    const myEmail = (currentUserRef.current?.email || '').trim().toLowerCase();
    const isSender =
      session.fromDeviceId === deviceId ||
      (session.fromUser?.email && myEmail && session.fromUser.email.toLowerCase() === myEmail);
    const partnerDeviceId = isSender ? session.toDeviceId : session.fromDeviceId;

    const curCall = activeCallRef.current;
    if (curCall && (!partnerDeviceId || curCall.peerDeviceId === partnerDeviceId)) {
      endActiveCall();
    }

    const cancelPayload = {
      requestId: session.id,
      partnerDeviceId,
      cancelledByDeviceId: deviceId,
      cancelledByUsername: currentUserRef.current?.username || 'Partner'
    };

    try {
      const response = await carpoolFetch('/api/carpool/linkup/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelPayload)
      });
      const result = await safeJson(response);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Could not cancel the link up.');
    } catch (error: any) {
      alert(error?.message || 'Could not cancel the link up. Please try again.');
      return;
    }

    setAcceptedLinkUpSession(null);
    setPendingSentRequestId(null);
    setConfirmHomeCancel(false);
    await sendRealtimeBroadcast('linkup_cancelled', cancelPayload);
    showLinkupNotice('You cancelled the link up session.');
  }, [deviceId, endActiveCall, sendRealtimeBroadcast, showLinkupNotice]);

  const handleCancelPendingLinkUp = async () => {
    const requestId = pendingSentRequestId;
    if (!requestId) return;
    try {
      const sessionResponse = await carpoolFetch(`/api/carpool/linkup/session/${requestId}`);
      const sessionData = await safeJson(sessionResponse);
      if (!sessionResponse.ok || !sessionData?.session) throw new Error(sessionData?.message || 'Could not load the pending request.');
      const response = await carpoolFetch('/api/carpool/linkup/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, cancelledByDeviceId: deviceId })
      });
      const result = await safeJson(response);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'Could not cancel the request.');
      setPendingSentRequestId(null);
      await sendRealtimeBroadcast('linkup_cancelled', {
        requestId,
        partnerDeviceId: sessionData.session.toDeviceId,
        cancelledByDeviceId: deviceId,
        cancelledByUsername: currentUser?.username || 'Partner'
      });
      showLinkupNotice('You cancelled the pending Link Up request.');
    } catch (error: any) {
      alert(error?.message || 'Could not cancel the request. Please try again.');
    }
  };

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (carpoolScannerOpen) setCarpoolScannerOpen(false);
        else if (currentRideModalOpen) setCurrentRideModalOpen(false);
        else if (rideModalOpen) setRideModalOpen(false);
        else if (poolingModalOpen) setPoolingModalOpen(false);
        else if (settingsModalOpen) setSettingsModalOpen(false);
        else if (scheduleModalOpen) setScheduleModalOpen(false);
        else if (otpModalOpen) setOtpModalOpen(false);
        else if (profilePanelOpen) setProfilePanelOpen(false);
        else if (optionsMenuOpen) setOptionsMenuOpen(false);
        else if (currentPage === 'home') handleBackToLogin();
        else if (currentPage === 'register') setCurrentPage('login');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    carpoolScannerOpen,
    currentRideModalOpen,
    rideModalOpen,
    poolingModalOpen,
    settingsModalOpen,
    scheduleModalOpen,
    otpModalOpen,
    profilePanelOpen,
    optionsMenuOpen,
    currentPage
  ]);

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) { alert('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before signing in.'); return; }
    const cleanEmail = loginEmail.trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: loginPassword,
      });

      if (error) {
        alert(error.message || 'Incorrect email or password.');
        return;
      }

      if (data?.user) {
        const username = data.user.user_metadata?.username || cleanEmail.split('@')[0];

        const userObj: User = {
          id: data.user.id,
          username,
          email: data.user.email || cleanEmail,
          emailVerified: !!data.user.email_confirmed_at
        };
        setCurrentUser(userObj);
        setCurrentPage('home');
      }
    } catch (err: any) {
      alert(err?.message || 'Could not authenticate. Check connection or verify credentials.');
    }
  };

  // Register handler
  const initiateRegistration = async () => {
    if (registrationLock.current) return;
    if (pendingRegistration) {
      setOtpTarget(pendingRegistration.email);
      setOtpModalOpen(true);
      return;
    }
    if (!isSupabaseConfigured) { alert('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before registering.'); return; }
    if (regUsername.trim().length < 2) {
      alert('Username must be at least 2 characters.');
      return;
    }
    const cleanEmail = regEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      alert('Please enter a valid email address.');
      return;
    }
    if (regPassword.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      alert('Passwords do not match.');
      return;
    }
    registrationLock.current = true;
    try {
      const username = regUsername.trim();
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: regPassword,
        options: { data: { username } }
      });
      if (error) throw error;

      // Supabase may return a user-shaped response for an existing confirmed
      // address to prevent account enumeration. Do not open OTP for that case.
      if (data.user && !data.session && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('An account may already exist for this email. Try signing in or use password reset.');
      }

      if (data.session && data.user) {
        await completeRegistration(data.user, cleanEmail, regPassword, username);
        return;
      }

      if (data.user && !data.user.email_confirmed_at) {
        setPendingRegistration({ email: cleanEmail, password: regPassword, username });
        setOtpTarget(cleanEmail);
        setOtpModalOpen(true);
        return;
      }

      throw new Error('Supabase did not return a registration session or a pending email confirmation.');
    } catch (err: any) {
      alert(err?.message || 'Registration failed.');
    } finally {
      registrationLock.current = false;
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    await initiateRegistration();
  };

  const completeRegistration = async (authUser: any, email: string, password: string, username: string) => {
    const user: User = {
      id: authUser.id,
      username: authUser.user_metadata?.username || username,
      email: authUser.email || email,
      emailVerified: !!authUser.email_confirmed_at
    };
    setCurrentUser(user);
    setCurrentPage('home');
    setLoginEmail(email);
    setLoginPassword('');
    setPendingRegistration(null);
    alert('Account created successfully! Your email has been verified.');
  };

  const handleStartOtp = async () => {
    const cleanEmail = regEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      alert('Please enter a valid email address first.');
      return;
    }
    if (regUsername.trim().length < 2) { alert('Username must be at least 2 characters.'); return; }
    if (regPassword.length < 8) { alert('Password must be at least 8 characters.'); return; }
    if (regPassword !== regConfirmPassword) { alert('Passwords do not match.'); return; }
    if (pendingRegistration) {
      if (pendingRegistration.email === cleanEmail && pendingRegistration.password === regPassword && pendingRegistration.username === regUsername.trim()) {
        setOtpTarget(cleanEmail);
        setOtpModalOpen(true);
      } else {
        setPendingRegistration(null);
        alert('Registration details changed. Click Verify Email again to request a new confirmation code.');
      }
      return;
    }
    await initiateRegistration();
  };

  const cleanRegistrationEmail = regEmail.trim().toLowerCase();
  const hasRegistrationEmail = regEmail.trim().length > 0;
  const isRegistrationEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRegistrationEmail);
  const isRegistrationEmailVerified = Boolean(verifiedEmail) && cleanRegistrationEmail === verifiedEmail;
  const shouldShowEmailVerification = hasRegistrationEmail && isRegistrationEmailValid && !isRegistrationEmailVerified;

  const handleOtpVerified = async (verifiedUser: any, verifiedSession: any) => {
    if (!pendingRegistration) return;
    try {
      const authUser = verifiedUser || verifiedSession?.user;
      if (!verifiedSession || !authUser || authUser.email?.toLowerCase() !== pendingRegistration.email) {
        throw new Error('Email verification succeeded, but Supabase did not return the expected authenticated registration session. Please sign in.');
      }
      setVerifiedEmail(pendingRegistration.email);
      await completeRegistration(verifiedSession.user || authUser, pendingRegistration.email, pendingRegistration.password, pendingRegistration.username);
    } catch (err: any) {
      alert(err?.message || 'Could not complete registration.');
    }
  };

  const resetEphemeralCarpoolState = () => {
    endActiveCall();
    serverCommutersRef.current = [];
    realtimeCommutersRef.current = [];
    broadcastPeersRef.current.clear();
    lastTrackedSignatureRef.current = '';
    setNearbyCommuters([]);
    setOutOfRangeCommuters([]);
    setIncomingLinkUp(null);
    setAcceptedLinkUpSession(null);
    setPendingSentRequestId(null);
    setLinkupNotice(null);
    setConfirmHomeCancel(false);
    setGpsAccuracyMeters(null);
    setCalibratingGps(false);
    const freshId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    sessionStorage.setItem('waygo_session_device_id', freshId);
    setDeviceId(freshId);
  };

  const handleBackToLogin = () => {
    removeMyPresence();
    resetEphemeralCarpoolState();
    setCurrentPage('login');
    setOptionsMenuOpen(false);
    setProfilePanelOpen(false);
  };

  const handleLogout = () => {
    removeMyPresence();
    resetEphemeralCarpoolState();
    supabase.auth.signOut().catch((err) => console.error('Sign out failed:', err));
    setCurrentPage('login');
    setProfilePanelOpen(false);
    setSettingsModalOpen(false);
    setLoginPassword('');
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Permanently delete your account and all saved data?')) return;
    removeMyPresence();
    resetEphemeralCarpoolState();
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { alert(`Could not delete account: ${error.message}`); return; }
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentRide(null);
    setCurrentPage('login');
    setSettingsModalOpen(false);
    setProfilePanelOpen(false);
  };

  const handleRideConfirmed = (booking: RideBooking) => {
    setCurrentRide(booking);
    if (currentUser?.id) setUserData(currentUser.id, 'current_ride', booking).catch((err) => alert(`Could not save ride: ${err.message}`));
    setCurrentRideModalOpen(true);
  };

  const handleRemoveRide = () => {
    if (!confirm('Remove this saved ride?')) return;
    setCurrentRide(null);
    if (currentUser?.id) deleteUserData(currentUser.id, 'current_ride').catch((err) => alert(`Could not remove ride: ${err.message}`));
    setCurrentRideModalOpen(false);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#071727] text-white font-sans antialiased overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* PAGE 1: AUTH / LOGIN */}
      {currentPage === 'login' && (
        <div id="authPage" className="min-h-screen min-h-[100dvh] flex flex-col md:flex-row items-stretch justify-center relative animate-fadeIn overflow-hidden">
          {/* NYC Street Skyline Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none -z-20">
            <img
              src="https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?auto=format&fit=crop&w=2600&q=88"
              alt="New York City street canyon with illuminated skyscrapers"
              referrerPolicy="no-referrer"
              className="w-full h-[135%] min-h-[135%] object-cover object-bottom animate-streetPan filter brightness-[0.52] contrast-[1.18] saturate-[1.22]"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-[#030914]/94 via-[#061528]/80 to-[#040c19]/90 mix-blend-multiply" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#020710] via-[#051324]/30 to-[#030a16]/75" />
            <div className="absolute inset-0 bg-radial-gradient from-transparent via-[#030914]/35 to-[#020710]/92" />
          </div>

          {/* Animated Vehicular Transit Light Trails */}
          <div className="absolute inset-0 pointer-events-none -z-15 overflow-hidden">
            <div className="absolute bottom-[18%] -left-40 w-[600px] h-[3px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent blur-[1.5px] opacity-75 animate-transit-1 transform rotate-[-2deg]" />
            <div className="absolute bottom-[24%] -left-32 w-[750px] h-[2.5px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent blur-[1.5px] opacity-65 animate-transit-2 transform rotate-[-3deg]" />
            <div className="absolute bottom-[12%] -left-20 w-[500px] h-[2.5px] bg-gradient-to-r from-transparent via-amber-400 to-transparent blur-[1px] opacity-65 animate-transit-3 transform rotate-[-1deg]" />
          </div>

          {/* Glass Architectural Window Details */}
          <div className="absolute inset-0 pointer-events-none -z-10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.09] via-transparent to-white/[0.02]" />
            <div className="absolute inset-0 opacity-15 bg-[linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] bg-[size:280px_280px]" />
            <div className="absolute -bottom-10 left-1/4 w-[600px] h-[350px] bg-emerald-500/12 rounded-full blur-[140px]" />
            <div className="absolute top-1/4 right-1/4 w-[500px] h-[380px] bg-cyan-500/12 rounded-full blur-[150px]" />
            <div className="absolute -top-16 left-1/3 w-[450px] h-[280px] bg-purple-500/12 rounded-full blur-[140px]" />
            <div className="absolute bottom-1/3 left-1/5 w-3.5 h-3.5 rounded-full bg-cyan-300/30 blur-[2px] animate-mote-slow" />
            <div className="absolute bottom-1/4 left-2/5 w-2.5 h-2.5 rounded-full bg-emerald-300/25 blur-[1.5px] animate-mote-fast" />
          </div>

          {/* Left Hero Section */}
          <section className="w-full md:w-[52%] min-h-[420px] md:min-h-screen p-8 md:p-16 flex flex-col items-center justify-center text-center relative z-10">
            <div className="login-brand-mark w-full flex justify-center mb-2">
              <WayGoLogo width="min(440px, 92%)" height="auto" />
            </div>
            <div className="auth-left-content mt-4 flex flex-col items-center max-w-lg">
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight mb-4 drop-shadow-md">
                Smarter rides. <span className="text-[#43dfa0]">Together.</span>
              </h1>
              <p className="text-sm md:text-base text-slate-200/90 leading-relaxed max-w-md drop-shadow">
                Connect with people going your way. Share journeys, save on travel, and make every ride count.
              </p>
              <div className="login-benefits mt-6 flex flex-wrap justify-center gap-3 text-xs font-bold tracking-wider text-slate-200">
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15">
                  SHARE RIDES
                </span>
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15">
                  SAVE MONEY
                </span>
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15">
                  GO FURTHER
                </span>
              </div>
            </div>
            <div className="login-copyright md:absolute md:bottom-6 text-xs text-slate-400 mt-6 md:mt-0">
              Â© 2026 WayGo
            </div>
          </section>

          {/* Right Login Box */}
          <section className="w-full md:w-[48%] min-h-[500px] md:min-h-screen p-6 md:p-16 flex items-center justify-center relative z-10">
            <div className="auth-box w-full max-w-[490px] p-8 md:p-12 rounded-[28px] border border-white/20 bg-gradient-to-br from-white/[0.12] via-white/[0.06] to-[#061729]/90 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-2xl relative overflow-hidden">
              <div className="absolute -top-20 -left-20 w-64 h-48 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-2xl pointer-events-none transform -rotate-12" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
              
              <div className="welcome text-center mb-7 relative z-10">
                <h1 className="text-2xl md:text-3xl font-extrabold mb-2 text-white">Welcome back</h1>
                <p className="text-xs md:text-sm text-slate-200/90">
                  New here?{' '}
                  <span
                    onClick={() => setCurrentPage('register')}
                    className="text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer transition"
                  >
                    Create an account
                  </span>
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="login-field text-left">
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">Email address</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="input w-full h-12 px-4 rounded-xl bg-[#051424]/70 border border-white/20 text-sm focus:outline-none focus:border-emerald-400 placeholder:text-white/35 transition"
                  />
                </div>

                <div className="login-field text-left">
                  <label className="block text-xs font-semibold text-slate-200 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Password"
                      required
                      className="input w-full h-12 px-4 pr-16 rounded-xl bg-[#051424]/70 border border-white/20 text-sm focus:outline-none focus:border-emerald-400 placeholder:text-white/35 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/60 hover:text-white font-medium cursor-pointer"
                    >
                      {showLoginPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div className="login-options flex items-center justify-between text-xs text-slate-300 pt-1">
                  <span />
                  <a
                    href="#forgot"
                    onClick={async (e) => {
                      e.preventDefault();
                      const email = loginEmail.trim().toLowerCase();
                      if (!email) { alert('Enter your email address first.'); return; }
                      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
                      if (error) alert(error.message);
                      else alert('If an account exists for that email, a password reset link has been sent.');
                    }}
                    className="forgot-login text-emerald-400 hover:underline"
                  >
                    Forgot password?
                  </a>
                </div>

                <button
                  type="submit"
                  className="start w-full h-12 mt-4 rounded-xl bg-gradient-to-r from-[#42db9a] to-[#06b982] hover:from-[#5eeab0] hover:to-[#0bcc92] text-white font-bold text-base shadow-lg shadow-emerald-600/20 transition transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                >
                  Sign in
                </button>

                <div className="login-hint text-center text-[11px] text-slate-400 pt-1">
                  Your WayGo journey starts here.
                </div>
              </form>

              <button
                type="button"
                onClick={() => setCurrentPage('register')}
                className="w-full h-11 mt-4 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs transition cursor-pointer"
              >
                Create New Account
              </button>
            </div>
          </section>
        </div>
      )}

      {/* PAGE 2: CREATE ACCOUNT (WITH 8-DIGIT EMAIL OTP VERIFICATION) */}
      {currentPage === 'register' && (
        <div id="createAccountPage" className="min-h-screen p-4 py-10 flex items-center justify-center bg-gradient-to-br from-[#060a14] via-[#091120] to-[#111827] animate-fadeIn">
          <div className="create-box w-full max-w-[460px] p-7 md:p-10 rounded-3xl border border-white/20 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-2xl shadow-2xl">
            <div className="create-header mb-6">
              <h1 className="font-serif text-3xl font-bold mb-2">Create your account</h1>
              <p className="text-xs text-white/60 leading-relaxed">
                Set up your WayGo account with <strong>8-digit email OTP verification</strong>.
              </p>
              <button
                type="button"
                onClick={() => setCurrentPage('login')}
                className="inline-block mt-2 text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline transition cursor-pointer"
              >
                Already have an account? Sign in
              </button>
            </div>

            <form onSubmit={handleRegister} className="space-y-3.5">
              {/* Username */}
              <div className="login-field text-left">
                <label className="block text-xs font-semibold text-slate-200 mb-1">Username</label>
                <input
                  type="text"
                  value={regUsername}
                    onChange={(e) => {
                      setRegUsername(e.target.value);
                      if (pendingRegistration) setPendingRegistration(null);
                    }}
                  placeholder="Choose a username"
                  maxLength={30}
                  required
                  className="input w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/20 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Email with 8-Digit Verification Badge / Action */}
              <div className="login-field text-left">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-200">Email address</label>
                  {isRegistrationEmailVerified ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Email Verified (8-Digit OTP)
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartOtp}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer"
                    >
                      Verify via 8-Digit OTP
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => {
                      const nextEmail = e.target.value;
                      setRegEmail(nextEmail);
                      if (nextEmail !== regEmail) setVerifiedEmail('');
                      if (pendingRegistration) setPendingRegistration(null);
                    }}
                    placeholder="Enter your email"
                    required
                    className="input w-full h-11 px-3.5 rounded-xl bg-white/10 border border-white/20 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400"
                  />
                  {shouldShowEmailVerification && (
                    <button
                      type="button"
                      onClick={handleStartOtp}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[10.5px] font-bold border border-cyan-500/30 cursor-pointer"
                    >
                      Verify 8-Digit OTP
                    </button>
                  )}
                </div>
                {shouldShowEmailVerification && (
                  <p className="mt-1.5 text-[11px] text-white/50">
                    Verify your email address with an 8-digit code to continue.
                  </p>
                )}
              </div>

              {/* Password */}
              <div className="login-field text-left">
                <label className="block text-xs font-semibold text-slate-200 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => {
                      setRegPassword(e.target.value);
                      if (pendingRegistration) setPendingRegistration(null);
                    }}
                    placeholder="Create a password"
                    minLength={4}
                    required
                    className="input w-full h-11 px-3.5 pr-14 rounded-xl bg-white/10 border border-white/20 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/60 hover:text-white font-medium cursor-pointer"
                  >
                    {showRegPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="login-field text-left">
                <label className="block text-xs font-semibold text-slate-200 mb-1">Confirm password</label>
                <div className="relative">
                  <input
                    type={showRegConfirmPassword ? 'text' : 'password'}
                    value={regConfirmPassword}
                    onChange={(e) => {
                      setRegConfirmPassword(e.target.value);
                      if (pendingRegistration) setPendingRegistration(null);
                    }}
                    placeholder="Re-enter your password"
                    minLength={4}
                    required
                    className="input w-full h-11 px-3.5 pr-14 rounded-xl bg-white/10 border border-white/20 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/60 hover:text-white font-medium cursor-pointer"
                  >
                    {showRegConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-12 mt-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-sm shadow-xl shadow-emerald-500/20 transition cursor-pointer"
              >
                Create Account
              </button>

              <div className="text-center text-[11px] text-white/40 pt-1">
                Your credentials and 8-digit OTP verifications are protected with WayGo & Supabase backend.
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAGE 3: HOME DASHBOARD */}
      {currentPage === 'home' && (
        <div id="homePage" className="min-h-screen min-h-[100dvh] w-full relative overflow-hidden flex flex-col justify-between animate-fadeIn bg-transparent pb-[env(safe-area-inset-bottom,0px)]">
          {/* Interactive Mouse Ambient Background Canvas */}
          <AmbientBackground />

          {/* Background Gradient Base Layer */}
          <div className="fixed inset-0 bg-gradient-to-b from-[#0b172a]/70 via-[#0d1f35]/50 to-[#081220]/80 -z-10 pointer-events-none" />

          {/* Top Navbar */}
          <nav className="relative z-50 h-[75px] flex items-center justify-between px-6 md:px-10 border-b border-white/15 bg-white/10 backdrop-blur-xl">
            {/* Menu button & Back button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setOptionsMenuOpen(!optionsMenuOpen)}
                className="w-11 h-11 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition cursor-pointer"
              >
                â˜°
              </button>
              <button
                type="button"
                onClick={handleBackToLogin}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/25 bg-[#081222]/50 hover:bg-[#081222]/80 text-white text-xs font-bold backdrop-blur-md transition cursor-pointer"
              >
                <span>â†</span> Back
              </button>
            </div>

            {/* Centered WayGo Logo */}
            <div className="cursor-pointer" onClick={() => setOptionsMenuOpen(false)}>
              <WayGoLogo width={150} height={62} />
            </div>

            {/* Profile Button */}
            <button
              type="button"
              onClick={() => setProfilePanelOpen(!profilePanelOpen)}
              className="px-4 py-2 rounded-2xl border border-white/25 bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer"
            >
              Profile
            </button>
          </nav>

          {/* Floating Current Ride Shortcut */}
          <button
            type="button"
            onClick={() => setCurrentRideModalOpen(true)}
            className="fixed right-5 bottom-5 z-40 px-5 py-3 rounded-2xl border border-white/30 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-xl shadow-black/40 transition transform hover:-translate-y-1 cursor-pointer"
          >
            ðŸš— My Current Ride
          </button>

          {/* Options Dropdown Menu */}
          {optionsMenuOpen && (
            <div className="fixed top-[85px] left-5 z-50 w-64 p-3 rounded-2xl border border-white/20 bg-gray-900/95 backdrop-blur-2xl shadow-2xl text-white animate-fadeIn">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-white/40">Options</div>
              <div
                onClick={() => setScheduleSubmenuOpen(!scheduleSubmenuOpen)}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-white/10 cursor-pointer text-sm font-semibold transition"
              >
                <span>ðŸ“… &nbsp; Schedule</span>
                <span className="text-xs text-white/50">{scheduleSubmenuOpen ? 'â–²' : 'â–¼'}</span>
              </div>
              {scheduleSubmenuOpen && (
                <div className="ml-3 pl-3 border-l border-white/20 my-1 space-y-1">
                  <div
                    onClick={() => {
                      setScheduleModalOpen(true);
                      setOptionsMenuOpen(false);
                    }}
                    className="p-2 rounded-lg hover:bg-white/10 text-xs text-white/80 cursor-pointer"
                  >
                    ðŸ‘ï¸ &nbsp; View Schedule
                  </div>
                  <div
                    onClick={() => {
                      setScheduleModalOpen(true);
                      setOptionsMenuOpen(false);
                    }}
                    className="p-2 rounded-lg hover:bg-white/10 text-xs text-white/80 cursor-pointer"
                  >
                    âž• &nbsp; Add Schedule
                  </div>
                  <div
                    onClick={() => {
                      setScheduleModalOpen(true);
                      setOptionsMenuOpen(false);
                    }}
                    className="p-2 rounded-lg hover:bg-white/10 text-xs text-white/80 cursor-pointer"
                  >
                    âœï¸ &nbsp; Edit Schedule
                  </div>
                </div>
              )}

              <div
                onClick={() => {
                  setCarpoolScannerOpen(true);
                  setOptionsMenuOpen(false);
                }}
                className="p-3 rounded-xl hover:bg-white/10 cursor-pointer text-sm font-semibold transition flex items-center justify-between"
              >
                <span>âš¡ &nbsp; Scan Area to Link Up</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  50% OFF
                </span>
              </div>

              <div
                onClick={() => {
                  setCurrentRideModalOpen(true);
                  setOptionsMenuOpen(false);
                }}
                className="p-3 rounded-xl hover:bg-white/10 cursor-pointer text-sm font-semibold transition"
              >
                ðŸš— &nbsp; My Current Ride
              </div>

              <div
                onClick={() => {
                  alert('Previously Contacted riders feature coming soon!');
                  setOptionsMenuOpen(false);
                }}
                className="p-3 rounded-xl hover:bg-white/10 cursor-pointer text-sm font-semibold transition"
              >
                ðŸ’¬ &nbsp; Previously Contacted
              </div>

              <div
                onClick={() => {
                  setSettingsModalOpen(true);
                  setOptionsMenuOpen(false);
                }}
                className="p-3 rounded-xl hover:bg-white/10 cursor-pointer text-sm font-semibold transition"
              >
                âš™ï¸ &nbsp; Settings
              </div>
            </div>
          )}

          {/* Main Hero Content */}
          <main className="relative z-10 flex flex-col items-center justify-center p-6 text-center my-auto">
            {/* Real-Time Incoming Link-Up Notification Banner on Home Dashboard */}
            {incomingLinkUp && !carpoolScannerOpen && (
              <div className="w-full max-w-[520px] mb-5 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-cyan-500/25 border-2 border-emerald-400 shadow-2xl text-left animate-fadeIn">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/30 text-emerald-200 text-[10px] font-black uppercase tracking-wider mb-1.5">
                  âš¡ Incoming Link Up Request
                </div>
                <div className="text-sm sm:text-base font-bold text-white">
                  {incomingLinkUp.fromUser?.username || 'Nearby Commuter'} wants to link up with you!
                </div>
                <div className="text-xs text-slate-200 mt-0.5">
                  Pickup: <strong>{incomingLinkUp.fromUser?.pickup}</strong>
                </div>
                <div className="flex gap-2.5 mt-3">
                  <button
                    type="button"
                    onClick={handleAcceptIncomingLinkUp}
                    className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs shadow-lg transition cursor-pointer"
                  >
                    âœ“ Accept & Connect
                  </button>
                  <button
                    type="button"
                    onClick={handleDeclineIncomingLinkUp}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-semibold text-xs transition cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Link-Up Notice Banner (e.g., partner cancelled) */}
            {linkupNotice && !carpoolScannerOpen && (
              <div className="w-full max-w-[520px] mb-4 px-4 py-3 rounded-2xl bg-amber-500/15 border border-amber-400/40 text-amber-100 text-xs font-semibold flex items-center justify-between gap-3 text-left animate-fadeIn">
                <span>â„¹ï¸ {linkupNotice}</span>
                <button
                  type="button"
                  onClick={() => setLinkupNotice(null)}
                  className="p-1 rounded-lg hover:bg-white/10 text-amber-200 cursor-pointer shrink-0"
                  aria-label="Dismiss notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Linked Up Partner Quick-Call & Cancel Banner on Home Dashboard */}
            {acceptedLinkUpSession && !carpoolScannerOpen && (() => {
              const isSender =
                acceptedLinkUpSession.fromDeviceId === deviceId ||
                (acceptedLinkUpSession.fromUser?.email &&
                  currentUser?.email &&
                  acceptedLinkUpSession.fromUser.email.toLowerCase() === currentUser.email.toLowerCase());
              const partner = isSender ? acceptedLinkUpSession.toUser : acceptedLinkUpSession.fromUser;
              const partnerDeviceId = isSender ? acceptedLinkUpSession.toDeviceId : acceptedLinkUpSession.fromDeviceId;
              const isPartnerTestBot =
                Boolean(partnerDeviceId) &&
                (partnerDeviceId.startsWith('dev_real_user_') || partnerDeviceId.startsWith('test_'));
              return (
                <div className="w-full max-w-[520px] mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-cyan-500/20 border border-emerald-400/50 shadow-xl flex flex-wrap items-center justify-between gap-3 text-left animate-fadeIn">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                      ðŸ¤ Active Pool Partner
                    </div>
                    <div className="text-sm font-bold text-white truncate">
                      {partner?.username || 'Carpool Partner'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {partnerDeviceId && !isPartnerTestBot && (
                      <button
                        type="button"
                        disabled={Boolean(activeCall && activeCall.status !== 'ended' && activeCall.status !== 'error')}
                        onClick={() =>
                          startInWebsiteCall({
                            deviceId: partnerDeviceId,
                            username: partner?.username || 'Partner',
                            email: partner?.email
                          })
                        }
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white font-bold text-xs shadow-md flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call Partner</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCarpoolScannerOpen(true)}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs transition cursor-pointer"
                    >
                      Open Details
                    </button>
                    {!confirmHomeCancel ? (
                      <button
                        type="button"
                        onClick={() => setConfirmHomeCancel(true)}
                        className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 font-semibold text-xs transition cursor-pointer"
                      >
                        Cancel Link Up
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleCancelAcceptedLinkUp}
                          className="px-2.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer"
                        >
                          Confirm Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmHomeCancel(false)}
                          className="px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 font-semibold text-xs transition cursor-pointer"
                        >
                          Keep
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight pt-1 pb-3 px-2 leading-snug md:leading-normal bg-gradient-to-r from-white via-[#e7f5ff] to-[#a7f3d0] bg-clip-text text-transparent drop-shadow-md overflow-visible select-none">
              {dayGreeting}
            </h1>

            {/* Inspiring Motivational Quote */}
            <DailyQuote />

            {/* Check for Vehicle Pooling Card */}
            <div className="w-full max-w-[460px] p-8 md:p-10 rounded-[32px] border border-white/25 bg-gradient-to-br from-[#0e1e33]/90 to-[#13293e]/85 backdrop-blur-2xl shadow-2xl text-center relative group hover:border-emerald-400/40 transition duration-300">
              <div className="text-5xl mb-3 transition transform group-hover:scale-110 duration-300">ðŸš˜</div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[11px] text-emerald-300 font-bold mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Preset: MIT-WPU Kothrud, Pune</span>
              </div>

              {/* Real-Time 3km Detection Pill */}
              <div className="mb-3">
                {nearbyCommuters.length > 0 ? (
                  <div
                    onClick={() => setCarpoolScannerOpen(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-xs text-cyan-200 font-bold cursor-pointer hover:bg-cyan-500/30 transition"
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>
                      {nearbyCommuters.length} Account{nearbyCommuters.length > 1 ? 's' : ''} Live Within 3 km
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>3 km Live Radar Active â€¢ Your account is visible</span>
                  </div>
                )}
              </div>

              <h2 className="text-2xl font-bold mb-2">Vehicle Pooling & Link Up</h2>
              <p className="text-xs md:text-sm text-white/70 leading-relaxed mb-6">
                Heading to <strong className="text-white">MIT-WPU, Kothrud, Pune</strong>? Detect nearby accounts within 3 km in real time, meet at the optimal middle point, and split cab fares 50/50 on Uber, Ola, or Rapido!
              </p>
              
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setCarpoolScannerOpen(true)}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 border border-white/20 text-white font-bold text-sm shadow-xl shadow-emerald-500/25 transition transform hover:-translate-y-0.5 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>
                    {nearbyCommuters.length > 0
                      ? `âš¡ View ${nearbyCommuters.length} Nearby Account${nearbyCommuters.length > 1 ? 's' : ''} (3 km) â†’`
                      : 'âš¡ Scan 3 km Area & Link Up (Split 50/50) â†’'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPoolingModalOpen(true)}
                  className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>ðŸ—ºï¸ Choose Vehicle & Open Map</span>
                </button>
              </div>
            </div>
          </main>

          <footer className="relative z-10 py-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] text-center text-xs text-white/40">
            WayGo Mobility Network â€¢ Real-Time Pooling
          </footer>
        </div>
      )}

      {/* MODALS & PANELS */}
      {/* 1. 8-Digit OTP Verification Modal */}
      <OtpVerificationModal
        isOpen={otpModalOpen}
        target={otpTarget}
        onClose={() => setOtpModalOpen(false)}
        onVerified={handleOtpVerified}
      />

      {/* 2. Pooling Type Selection Modal (Car vs Bike -> Private vs Cab) */}
      <PoolingSelectionModal
        isOpen={poolingModalOpen}
        onClose={() => setPoolingModalOpen(false)}
        onSelectMode={(mode) => {
          setSelectedPoolingType(mode);
          setPoolingModalOpen(false);
          setRideModalOpen(true);
        }}
      />

      {/* 3. Google Maps Ride Booking Modal */}
      <RideMapModal
        isOpen={rideModalOpen}
        selectedPoolingType={selectedPoolingType}
        onClose={() => setRideModalOpen(false)}
        onRideConfirmed={handleRideConfirmed}
        onOpenScanner={() => setCarpoolScannerOpen(true)}
      />

      {/* 4. My Current Ride Panel */}
      <CurrentRideModal
        isOpen={currentRideModalOpen}
        currentRide={currentRide}
        onClose={() => setCurrentRideModalOpen(false)}
        onRemoveRide={handleRemoveRide}
        onOpenBooking={() => setPoolingModalOpen(true)}
      />

      {/* 5. Schedule / Timetable Modal */}
      <ScheduleModal isOpen={scheduleModalOpen} userId={currentUser?.id} onClose={() => setScheduleModalOpen(false)} />

      {/* 6. Settings Modal */}
      <SettingsModal
        isOpen={settingsModalOpen}
        currentUser={currentUser}
        onClose={() => setSettingsModalOpen(false)}
        onUpdateUser={(updated) => {
          if (currentUser) {
            setCurrentUser({ ...currentUser, ...updated });
          }
        }}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
      />

      {/* 7. Profile Slide-Out Panel */}
      <ProfilePanel
        isOpen={profilePanelOpen}
        user={currentUser}
        onClose={() => setProfilePanelOpen(false)}
        onEditProfile={() => {
          setProfilePanelOpen(false);
          setSettingsModalOpen(true);
        }}
        onLogout={handleLogout}
        onClearAccount={handleDeleteAccount}
      />

      {/* 8. Carpool Area Scanner & Link Up Handshake Modal */}
      <CarpoolScannerModal
        isOpen={carpoolScannerOpen}
        currentUser={currentUser}
        deviceId={deviceId}
        pickupLocation={livePickupLocation}
        pickupCoords={livePickupCoords}
        gpsAccuracyMeters={gpsAccuracyMeters}
        calibratingGps={calibratingGps}
        locationSource={locationSource}
        locationStatus={locationStatus}
        locationFixTimestamp={locationFixTimestamp}
        locationError={locationError}
        onSetCustomLocation={handleSetCustomLocation}
        locatingUser={locatingUser}
        onRefreshLocation={() => locateUserPosition(false)}
        onCalibrateGps={() => locateUserPosition(true)}
        seekers={nearbyCommuters}
        outOfRangeSeekers={outOfRangeCommuters}
        onRefreshNearby={handleManualScanRefresh}
        incomingRequest={incomingLinkUp}
        onAcceptIncoming={handleAcceptIncomingLinkUp}
        onDeclineIncoming={handleDeclineIncomingLinkUp}
        activeSession={acceptedLinkUpSession}
        onSetActiveSession={setAcceptedLinkUpSession}
        onCancelLinkUp={handleCancelAcceptedLinkUp}
        onCancelPendingLinkUp={handleCancelPendingLinkUp}
        linkupNotice={linkupNotice}
        onDismissLinkupNotice={() => setLinkupNotice(null)}
        pendingSentRequestId={pendingSentRequestId}
        onSetPendingSentRequestId={setPendingSentRequestId}
        onBroadcastLinkUpRequest={(session) =>
          sendRealtimeBroadcast('linkup_request', {
            toDeviceId: session.toDeviceId,
            session
          })
        }
        onCallPartner={startInWebsiteCall}
        isCallActive={Boolean(activeCall && activeCall.status !== 'idle' && activeCall.status !== 'ended' && activeCall.status !== 'error')}
        onClose={() => setCarpoolScannerOpen(false)}
      />

      {/* 9. Hidden Remote Audio Element & In-Website WebRTC Voice Call Overlay */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <InWebsiteCallOverlay
        call={activeCall}
        micMuted={micMuted}
        speakerMuted={speakerMuted}
        audioLevel={callAudioLevel}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
        onEnd={endActiveCall}
        onToggleMic={toggleMicMute}
        onToggleSpeaker={toggleSpeakerMute}
        onDismissEnded={() => setActiveCall(null)}
      />
    </div>
  );
}
