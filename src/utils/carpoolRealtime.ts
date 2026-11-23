import { RealCommuter } from '../types';

export const FIXED_DEST_NAME = 'MIT World Peace University (MIT-WPU), Kothrud, Pune';
export const FIXED_DEST_COORDS = { lat: 18.5178, lng: 73.8151 };
export const DETECTION_RADIUS_KM = 3;
export const SUPABASE_CARPOOL_CHANNEL = 'waygo_carpool_live_3km_v1';

export type LocationSource = 'gps' | 'ip' | 'manual' | 'default';

/**
 * WGS-84 Ellipsoidal Vincenty Geodesic Distance in meters (sub-meter accuracy).
 * Falls back to Haversine only for identical or antipodal edge cases.
 */
export function calcDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const a = 6378137.0; // WGS-84 semi-major axis (m)
  const f = 1 / 298.257223563; // WGS-84 flattening
  const b = (1 - f) * a;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const L = toRad(lon2 - lon1);
  const U1 = Math.atan((1 - f) * Math.tan(toRad(lat1)));
  const U2 = Math.atan((1 - f) * Math.tan(toRad(lat2)));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaP = 2 * Math.PI;
  let iterLimit = 100;
  let cosSqAlpha = 0;
  let sinSigma = 0;
  let cos2SigmaM = 0;
  let cosSigma = 0;
  let sigma = 0;

  while (Math.abs(lambda - lambdaP) > 1e-12 && --iterLimit > 0) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      cosU2 * sinLambda * (cosU2 * sinLambda) +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) *
          (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    );
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  }

  if (iterLimit === 0) {
    // Antipodal fallback
    const R = 6371008.8;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
  }

  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));

  return Math.round(b * A * (sigma - deltaSigma));
}

export function calcDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.round(calcDistanceMeters(lat1, lon1, lat2, lon2)) / 1000;
}

export function formatPreciseDistance(meters?: number, fallbackKm?: number): string {
  const m =
    typeof meters === 'number' && !isNaN(meters)
      ? Math.round(meters)
      : Math.round((fallbackKm || 0) * 1000);
  if (m < 1000) {
    return `${m} m`;
  }
  return `${(m / 1000).toFixed(2)} km`;
}

export function computeRouteMatchPercent(
  destLat1: number,
  destLng1: number,
  destLat2: number,
  destLng2: number,
  radiusKm = DETECTION_RADIUS_KM
): number {
  const destDistKm = calcDistanceKm(destLat1, destLng1, destLat2, destLng2);
  return Math.max(70, Math.min(99, Math.round(100 - (destDistKm / Math.max(1, radiusKm * 2)) * 30)));
}

export function buildLinkUpSessionPayload(
  requestId: string,
  fromDeviceId: string,
  fromUser: {
    username: string;
    email?: string;
    pickup: string;
    drop: string;
    coords: { lat: number; lng: number };
  },
  toDeviceId: string,
  toUser: {
    username: string;
    email?: string;
    pickup: string;
    drop: string;
    coords: { lat: number; lng: number };
  },
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' = 'accepted'
) {
  const midLat = Number(((fromUser.coords.lat + toUser.coords.lat) / 2).toFixed(6));
  const midLng = Number(((fromUser.coords.lng + toUser.coords.lng) / 2).toFixed(6));
  const distMetersUser = calcDistanceMeters(fromUser.coords.lat, fromUser.coords.lng, midLat, midLng);
  const distMetersPartner = calcDistanceMeters(toUser.coords.lat, toUser.coords.lng, midLat, midLng);
  const walkMinUser = Math.max(1, Math.round((distMetersUser / 1000) * 12));
  const walkMinPartner = Math.max(1, Math.round((distMetersPartner / 1000) * 12));

  const destName = fromUser.drop || FIXED_DEST_NAME;
  const midpointName = `Shared Midpoint Near (${midLat}, ${midLng})`;

  const estTripKm = Math.max(
    2.2,
    parseFloat((calcDistanceKm(midLat, midLng, FIXED_DEST_COORDS.lat, FIXED_DEST_COORDS.lng) || 5.4).toFixed(1))
  );
  const estTripMin = Math.round(estTripKm * 2.7);

  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  const istTimeDecimal = istDate.getUTCHours() + istDate.getUTCMinutes() / 60;

  let trafficMultiplier = 1.0;
  let trafficCondition = 'Normal Traffic Flow — Standard Rates';
  if (istTimeDecimal >= 8.5 && istTimeDecimal <= 11.5) {
    trafficMultiplier = 1.28;
    trafficCondition = 'Morning Rush Traffic (Peak +28%)';
  } else if (istTimeDecimal >= 17.0 && istTimeDecimal <= 20.75) {
    trafficMultiplier = 1.34;
    trafficCondition = 'Evening Peak Congestion (Peak +34%)';
  } else if (istTimeDecimal >= 23.0 || istTimeDecimal <= 5.0) {
    trafficMultiplier = 1.15;
    trafficCondition = 'Late Night Ride Surcharge (+15%)';
  }

  const uberSolo = Math.round((50 + estTripKm * 17.5 + estTripMin * 1.6 + 15) * trafficMultiplier);
  const uberSplit = Math.round(uberSolo / 2);

  const olaSolo = Math.round((45 + estTripKm * 16.8 + estTripMin * 1.5 + 14) * trafficMultiplier);
  const olaSplit = Math.round(olaSolo / 2);

  const rapidoSolo = Math.round((35 + estTripKm * 13.5 + estTripMin * 1.2 + 10) * Math.min(1.22, trafficMultiplier));
  const rapidoSplit = Math.round(rapidoSolo / 2);

  const formattedTimeIST =
    istDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: true
    }) + ' IST';

  return {
    id: requestId,
    fromDeviceId,
    fromUser,
    toDeviceId,
    toUser,
    status,
    createdAt: Date.now(),
    ...(status === 'accepted'
      ? {
          acceptedAt: Date.now(),
          midpoint: {
            name: midpointName,
            lat: midLat,
            lng: midLng,
            distanceFromUser: `${distMetersUser} meters`,
            distanceFromPartner: `${distMetersPartner} meters`,
            walkingTimeUser: `${walkMinUser} min walk`,
            walkingTimePartner: `${walkMinPartner} min walk`,
            advantageNote: 'Equidistant pick-up spot calculated between both riders for a 50/50 split.'
          },
          fareComparison: {
            totalDistanceKm: estTripKm,
            estimatedMinutes: estTripMin,
            trafficCondition,
            trafficMultiplier,
            updatedAt: formattedTimeIST,
            uber: {
              service: 'Uber Go (AC Sedan)',
              soloFare: uberSolo,
              splitFarePerPerson: uberSplit,
              savedPerPerson: uberSolo - uberSplit,
              rateBreakdown: `Base ₹50 + ₹17.5/km + ₹1.6/min • ${trafficCondition}`,
              bookingUrl: `https://m.uber.com/ul/?action=setPickup&client_id=waygo_pool&pickup[latitude]=${midLat}&pickup[longitude]=${midLng}&pickup[nickname]=${encodeURIComponent(midpointName)}&dropoff[latitude]=${FIXED_DEST_COORDS.lat}&dropoff[longitude]=${FIXED_DEST_COORDS.lng}&dropoff[nickname]=${encodeURIComponent(destName)}`
            },
            ola: {
              service: 'Ola Mini / Prime',
              soloFare: olaSolo,
              splitFarePerPerson: olaSplit,
              savedPerPerson: olaSolo - olaSplit,
              rateBreakdown: `Base ₹45 + ₹16.8/km + ₹1.5/min • ${trafficCondition}`,
              bookingUrl: `https://book.olacabs.com/?lat=${midLat}&lng=${midLng}&pickup_name=${encodeURIComponent(midpointName)}&drop_lat=${FIXED_DEST_COORDS.lat}&drop_lng=${FIXED_DEST_COORDS.lng}&drop_name=${encodeURIComponent(destName)}`
            },
            rapido: {
              service: 'Rapido Cab Eco',
              soloFare: rapidoSolo,
              splitFarePerPerson: rapidoSplit,
              savedPerPerson: rapidoSolo - rapidoSplit,
              rateBreakdown: `Base ₹35 + ₹13.5/km + ₹1.2/min • Economy Tier`,
              bookingUrl: `https://rapido.bike/ride?pickup_lat=${midLat}&pickup_lng=${midLng}&pickup_address=${encodeURIComponent(midpointName)}&drop_lat=${FIXED_DEST_COORDS.lat}&drop_lng=${FIXED_DEST_COORDS.lng}&drop_address=${encodeURIComponent(destName)}`
            }
          }
        }
      : {})
  };
}

export interface RealtimePeerScanResult {
  withinRange: RealCommuter[];
  outOfRange: RealCommuter[];
}

export function extractRealtimePeerStatuses(
  presenceState: Record<string, any[]>,
  broadcastPeers: Map<string, any>,
  myDeviceId: string,
  myEmail: string,
  myLat: number,
  myLng: number,
  radiusKm = DETECTION_RADIUS_KM
): RealtimePeerScanResult {
  const cleanMyEmail = (myEmail || '').trim().toLowerCase();
  const candidatesByDevice = new Map<string, any>();
  const now = Date.now();

  // 1. Collect peers from Supabase Realtime Presence
  for (const [key, presences] of Object.entries(presenceState || {})) {
    if (!Array.isArray(presences) || presences.length === 0) continue;
    const latest = presences[presences.length - 1];
    const peerDeviceId = latest?.deviceId || key;
    if (!peerDeviceId || peerDeviceId === myDeviceId) continue;
    candidatesByDevice.set(peerDeviceId, latest);
  }

  // 2. Merge fresh peers from scanner_ping / scanner_pong broadcasts (within last 25s)
  for (const [peerDeviceId, peerData] of broadcastPeers.entries()) {
    if (!peerDeviceId || peerDeviceId === myDeviceId) continue;
    if (peerData?.receivedAt && now - peerData.receivedAt > 25000) continue;
    const existing = candidatesByDevice.get(peerDeviceId);
    if (!existing || (peerData?.updatedAt || 0) >= (existing?.updatedAt || 0)) {
      candidatesByDevice.set(peerDeviceId, peerData);
    }
  }

  const withinRange: RealCommuter[] = [];
  const outOfRange: RealCommuter[] = [];
  const seenEmails = new Set<string>();

  for (const [peerDeviceId, peer] of candidatesByDevice.entries()) {
    const peerEmail = (peer?.email || '').trim().toLowerCase();
    if (cleanMyEmail && peerEmail && peerEmail === cleanMyEmail) continue;

    // Avoid duplicate entries if same remote email reconnected with a new tab/deviceId
    if (peerEmail) {
      if (seenEmails.has(peerEmail)) continue;
      seenEmails.add(peerEmail);
    }

    const coords = peer?.pickupCoords;
    if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') continue;

    const distMeters = calcDistanceMeters(myLat, myLng, coords.lat, coords.lng);
    const distKm = Math.round(distMeters) / 1000;
    const dropCoords = peer?.dropCoords || FIXED_DEST_COORDS;

    const commuter: RealCommuter = {
      deviceId: peerDeviceId,
      username: peer.username || 'Live Commuter',
      email: peerEmail,
      avatar: peer.avatar || '👤',
      pickup: peer.pickup || 'Nearby Location',
      drop: peer.drop || FIXED_DEST_NAME,
      pickupCoords: { lat: coords.lat, lng: coords.lng },
      dropCoords: { lat: dropCoords.lat, lng: dropCoords.lng },
      departTime: peer.departTime || 'Leaving now',
      vehiclePreference: peer.vehiclePreference || 'cab',
      distanceFromUserKm: distKm,
      distanceFromUserMeters: distMeters,
      coordsAccuracyMeters:
        typeof peer.coordsAccuracyMeters === 'number' ? Math.round(peer.coordsAccuracyMeters) : null,
      locationSource: peer.locationSource || undefined,
      routeMatchPercent: computeRouteMatchPercent(
        FIXED_DEST_COORDS.lat,
        FIXED_DEST_COORDS.lng,
        dropCoords.lat,
        dropCoords.lng,
        radiusKm
      )
    };

    if (distKm <= radiusKm) {
      withinRange.push(commuter);
    } else {
      outOfRange.push(commuter);
    }
  }

  return {
    withinRange: withinRange.sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm),
    outOfRange: outOfRange.sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm)
  };
}
