export interface User {
  id?: string;
  username: string;
  email: string;
  emailVerified?: boolean;
}

export type VehicleMode = 'car' | 'bike';
export type PoolingMode = 'bike' | 'private' | 'cab';

export interface RideBooking {
  id: string;
  type: PoolingMode;
  typeLabel: string;
  pickup: string;
  drop: string;
  distance: string;
  eta: string;
  fare: string;
  fareCalculatedAt?: string | null;
  fareNote: string;
  bookedAt: string;
  status: string;
  pickupCoords?: { lat: number; lon: number } | null;
  dropCoords?: { lat: number; lon: number } | null;
}

export interface TimetableSlot {
  time: string;
  key: string;
}

export interface SearchPlace {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

export interface CarpoolSeeker {
  id: string;
  name: string;
  email?: string;
  avatar: string;
  rating: number;
  tripsCount: number;
  verified: boolean;
  pickup: string;
  drop: string;
  pickupCoords: { lat: number; lng: number };
  dropCoords: { lat: number; lng: number };
  distanceFromUserKm: number;
  routeMatchPercent: number;
  departTime: string;
  vehiclePreference: 'cab' | 'private' | 'any';
}

export interface LinkUpSession {
  id: string;
  seeker: CarpoolSeeker;
  status: 'scanning' | 'pending' | 'accepted' | 'declined';
  requestedAt: string;
  acceptedAt?: string;
  midpoint: {
    name: string;
    lat: number;
    lng: number;
    distanceFromUser: string;
    distanceFromPartner: string;
    walkingTimeUser: string;
    walkingTimePartner: string;
    advantageNote: string;
  };
  fareComparison: {
    totalDistanceKm: number;
    estimatedMinutes: number;
    uber: {
      service: string;
      soloFare: number;
      splitFarePerPerson: number;
      savedPerPerson: number;
      bookingUrl: string;
    };
    ola: {
      service: string;
      soloFare: number;
      splitFarePerPerson: number;
      savedPerPerson: number;
      bookingUrl: string;
    };
    rapido: {
      service: string;
      soloFare: number;
      splitFarePerPerson: number;
      savedPerPerson: number;
      bookingUrl: string;
    };
  };
}

export interface RealCommuter {
  deviceId: string;
  username: string;
  email?: string;
  avatar?: string;
  pickup: string;
  drop: string;
  pickupCoords: { lat: number; lng: number };
  dropCoords: { lat: number; lng: number };
  departTime: string;
  vehiclePreference: 'cab' | 'private' | 'any';
  distanceFromUserKm: number;
  distanceFromUserMeters?: number;
  distanceUncertaintyMeters?: number;
  coordsAccuracyMeters?: number | null;
  locationSource?: 'gps' | 'ip' | 'manual' | 'default';
  locationStatus?: string;
  locationFixTimestamp?: number;
  routeMatchPercent: number;
}

export type CallSignalKind =
  | 'call_invite'
  | 'call_answer'
  | 'call_ice'
  | 'call_reject'
  | 'call_end'
  | 'call_busy';

export interface CallSignalPayload {
  signalId: string;
  callId: string;
  kind: CallSignalKind;
  fromDeviceId: string;
  fromUser: {
    username: string;
    email?: string;
  };
  toDeviceId: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  sentAt: number;
}

export type VoiceCallStatus =
  | 'idle'
  | 'calling'
  | 'ringing_in'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'error';

export interface ActiveVoiceCall {
  callId: string;
  peerDeviceId: string;
  peerUsername: string;
  peerEmail?: string;
  direction: 'outgoing' | 'incoming';
  status: VoiceCallStatus;
  startedAt?: number;
  errorMessage?: string;
  remoteOfferSdp?: RTCSessionDescriptionInit;
}

