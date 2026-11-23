import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin: SupabaseClient | null = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

interface AuthenticatedRequest extends Request {
  authUserId?: string;
  authEmail?: string;
  authUsername?: string;
}

const isValidDeviceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

async function requireCarpoolAuth(req: AuthenticatedRequest, res: Response, next: express.NextFunction) {
  if (!supabaseAdmin) {
    return res.status(503).json({ success: false, message: 'Carpool Supabase server credentials are not configured.' });
  }
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required.' });
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
    req.authUserId = data.user.id;
    req.authEmail = data.user.email || '';
    req.authUsername = data.user.user_metadata?.username || data.user.email?.split('@')[0] || 'Commuter';
    next();
  } catch {
    return res.status(503).json({ success: false, message: 'Unable to verify Supabase session.' });
  }
}

app.use('/api/carpool', requireCarpoolAuth);

// ========================================================
// REAL MULTI-DEVICE CARPOOL BROADCAST & LINK UP SYSTEM
// ========================================================
interface LiveCommuterPresence {
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
  lastSeenAt: number;
  coordsAccuracyMeters?: number | null;
  locationSource?: 'gps' | 'ip' | 'manual' | 'default';
  spawnedByDeviceId?: string;
}

interface LiveLinkUpSession {
  id: string;
  fromDeviceId: string;
  fromUser: {
    username: string;
    email?: string;
    pickup: string;
    drop: string;
    coords: { lat: number; lng: number };
  };
  toDeviceId: string;
  toUser: {
    username: string;
    email?: string;
    pickup: string;
    drop: string;
    coords: { lat: number; lng: number };
  };
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: number;
  acceptedAt?: number;
  cancelledAt?: number;
  cancelledBy?: string;
  midpoint?: {
    name: string;
    lat: number;
    lng: number;
    distanceFromUser: string;
    distanceFromPartner: string;
    walkingTimeUser: string;
    walkingTimePartner: string;
    advantageNote: string;
  };
  fareComparison?: any;
}

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const a = 6378137.0;
  const f = 1 / 298.257223563;
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

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.round(calculateDistanceMeters(lat1, lon1, lat2, lon2)) / 1000;
}

// Persisted rows are filtered by expires_at on reads. This job bounds table growth.
setInterval(async () => {
  if (!supabaseAdmin) return;
  const now = new Date().toISOString();
  await Promise.all([
    supabaseAdmin.from('carpool_presence').delete().lt('expires_at', now),
    supabaseAdmin.from('carpool_linkup_sessions').delete().lt('expires_at', now),
    supabaseAdmin.from('carpool_call_signals').delete().lt('expires_at', now),
  ]);
}, 60_000).unref();

async function deleteOwnedPresence(userId: string, deviceId: string) {
  const { data: spawned } = await supabaseAdmin!.from('carpool_presence')
    .select('device_id').eq('user_id', userId).eq('spawned_by_device_id', deviceId);
  await supabaseAdmin!.from('carpool_presence').delete().eq('user_id', userId).eq('device_id', deviceId);
  if (spawned?.length) {
    await supabaseAdmin!.from('carpool_presence').delete()
      .eq('user_id', userId).eq('spawned_by_device_id', deviceId);
  }
}

// Endpoint: Register or Heartbeat Real Device Commute Broadcast
app.post('/api/carpool/presence', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      deviceId,
      avatar,
      pickup,
      drop,
      pickupCoords,
      dropCoords,
      departTime,
      vehiclePreference,
      coordsAccuracyMeters,
      locationSource,
      spawnedByDeviceId
    } = req.body;
    if (!isValidDeviceId(deviceId) || !pickupCoords || !dropCoords) {
      return res.status(400).json({ success: false, message: 'deviceId and coordinates are required.' });
    }

    if (spawnedByDeviceId && (!isValidDeviceId(spawnedByDeviceId) || spawnedByDeviceId === deviceId)) {
      return res.status(400).json({ success: false, message: 'Invalid spawned device owner.' });
    }
    if (spawnedByDeviceId) {
      const { data: ownerPresence } = await supabaseAdmin!.from('carpool_presence')
        .select('device_id').eq('device_id', spawnedByDeviceId).eq('user_id', req.authUserId!).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (!ownerPresence) return res.status(403).json({ success: false, message: 'Spawned presence must belong to your active device.' });
    }
    const { data: existingRow } = await supabaseAdmin!.from('carpool_presence')
      .select('user_id').eq('device_id', deviceId).maybeSingle();
    if (existingRow && existingRow.user_id !== req.authUserId) {
      return res.status(409).json({ success: false, message: 'Device ID is already registered to another account.' });
    }
    const nextLat = Number(pickupCoords.lat);
    const nextLng = Number(pickupCoords.lng);
    const dropLat = Number(dropCoords.lat);
    const dropLng = Number(dropCoords.lng);
    if (![nextLat, nextLng, dropLat, dropLng].every(Number.isFinite) || Math.abs(nextLat) > 90 || Math.abs(dropLat) > 90 || Math.abs(nextLng) > 180 || Math.abs(dropLng) > 180) {
      return res.status(400).json({ success: false, message: 'Valid pickup and drop coordinates are required.' });
    }
    const presence: LiveCommuterPresence = {
      deviceId,
      username: req.authUsername || 'Commuter',
      email: req.authEmail || '',
      avatar: avatar || '👤',
      pickup: pickup || 'Pickup Point',
      drop: drop || 'Destination',
      pickupCoords: {
        lat: nextLat,
        lng: nextLng
      },
      dropCoords: {
        lat: dropLat,
        lng: dropLng
      },
      departTime: departTime || 'Leaving soon',
      vehiclePreference: vehiclePreference || 'any',
      lastSeenAt: Date.now(),
      coordsAccuracyMeters:
        typeof coordsAccuracyMeters === 'number' ? Math.round(coordsAccuracyMeters) : null,
      locationSource: locationSource || undefined,
      ...(spawnedByDeviceId ? { spawnedByDeviceId } : {})
    };
    const ttlMs = spawnedByDeviceId ? 3 * 60 * 1000 : 60 * 1000;
    const { error: upsertError } = await supabaseAdmin!.from('carpool_presence').upsert({
      device_id: deviceId,
      user_id: req.authUserId,
      spawned_by_device_id: spawnedByDeviceId || null,
      payload: presence,
      last_seen_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString()
    });
    if (upsertError) throw upsertError;


    const { count } = await supabaseAdmin!.from('carpool_presence').select('device_id', { count: 'exact', head: true }).gt('expires_at', new Date().toISOString());
    return res.json({
      success: true,
      message: 'Real device broadcast published.',
      totalActiveNetworkRiders: count || 0
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update presence.' });
  }
});

// Endpoint: Find Real Active Commuters Nearby (Different Accounts Within Range)
app.get('/api/carpool/nearby', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Math.max(0.1, Math.min(Number(req.query.radius) || 3, 50));
    const deviceId = (req.query.deviceId as string) || '';

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, message: 'Valid lat and lng query params are required.' });
    }

    const now = new Date().toISOString();
    const nearby: Array<
      LiveCommuterPresence & { distanceFromUserKm: number; distanceFromUserMeters: number; routeMatchPercent: number }
    > = [];

    const { data: activeRows, error } = await supabaseAdmin!.from('carpool_presence')
      .select('device_id,user_id,spawned_by_device_id,payload,last_seen_at,expires_at').gt('expires_at', now);
    if (error) throw error;
    for (const row of activeRows || []) {
      const id = row.device_id as string;
      const presence = row.payload as LiveCommuterPresence;
      if (id === deviceId) continue;
      if (row.user_id === req.authUserId && row.spawned_by_device_id !== deviceId) continue;
      if (row.spawned_by_device_id && row.spawned_by_device_id !== deviceId) continue;

      const distMeters = calculateDistanceMeters(lat, lng, presence.pickupCoords.lat, presence.pickupCoords.lng);
      const distKm = Math.round(distMeters) / 1000;
      if (distKm <= radiusKm) {
        const destDistKm = calculateDistanceKm(
          Number(req.query.destLat) || lat,
          Number(req.query.destLng) || lng,
          presence.dropCoords.lat,
          presence.dropCoords.lng
        );
        const matchPercent = Math.max(70, Math.min(99, Math.round(100 - (destDistKm / Math.max(1, radiusKm * 2)) * 30)));

        nearby.push({
          ...presence,
          distanceFromUserKm: distKm,
          distanceFromUserMeters: distMeters,
          routeMatchPercent: matchPercent
        });
      }
    }

    nearby.sort((a, b) => a.distanceFromUserKm - b.distanceFromUserKm);

    return res.json({
      success: true,
      count: nearby.length,
      radiusKm,
      commuters: nearby
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch nearby commuters.' });
  }
});

// Remove this user's device presence and any test commuters it spawned.
app.delete('/api/carpool/presence/:deviceId', async (req: AuthenticatedRequest, res: Response) => {
  const { deviceId } = req.params;
  if (deviceId) await deleteOwnedPresence(req.authUserId!, deviceId);
  return res.json({ success: true, message: 'Broadcast removed.' });
});

app.post('/api/carpool/presence/leave', async (req: AuthenticatedRequest, res: Response) => {
  const deviceId = req.body?.deviceId || (req.query.deviceId as string);
  if (deviceId) {
    await deleteOwnedPresence(req.authUserId!, deviceId);
  }
  return res.json({ success: true, message: 'Broadcast removed.' });
});

function computeAndAcceptLinkUp(session: LiveLinkUpSession, responderEmail?: string) {
  session.status = 'accepted';
  session.acceptedAt = Date.now();
  if (responderEmail) {
    session.toUser.email = responderEmail;
  }

  const midLat = Number(((session.fromUser.coords.lat + session.toUser.coords.lat) / 2).toFixed(6));
  const midLng = Number(((session.fromUser.coords.lng + session.toUser.coords.lng) / 2).toFixed(6));
  const distMetersUser = calculateDistanceMeters(session.fromUser.coords.lat, session.fromUser.coords.lng, midLat, midLng);
  const distMetersPartner = calculateDistanceMeters(session.toUser.coords.lat, session.toUser.coords.lng, midLat, midLng);
  const walkMinUser = Math.max(1, Math.round((distMetersUser / 1000) * 12));
  const walkMinPartner = Math.max(1, Math.round((distMetersPartner / 1000) * 12));

  const destName = session.fromUser.drop || 'MIT World Peace University (MIT-WPU), Kothrud, Pune';
  const destLat = 18.5178;
  const destLng = 73.8151;
  const midpointName = `Shared Midpoint Near Paud Road (${midLat}, ${midLng})`;

  const estTripKm = Math.max(2.2, parseFloat((calculateDistanceKm(midLat, midLng, destLat, destLng) || 5.8).toFixed(1)));
  const estTripMin = Math.round(estTripKm * 2.7);

  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  const istHours = istDate.getUTCHours();
  const istMinutes = istDate.getUTCMinutes();
  const istTimeDecimal = istHours + istMinutes / 60;

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

  const uberRaw = (50 + estTripKm * 17.5 + estTripMin * 1.6 + 15) * trafficMultiplier;
  const uberSolo = Math.round(uberRaw);
  const uberSplit = Math.round(uberSolo / 2);

  const olaRaw = (45 + estTripKm * 16.8 + estTripMin * 1.5 + 14) * trafficMultiplier;
  const olaSolo = Math.round(olaRaw);
  const olaSplit = Math.round(olaSolo / 2);

  const rapidoRaw = (35 + estTripKm * 13.5 + estTripMin * 1.2 + 10) * Math.min(1.22, trafficMultiplier);
  const rapidoSolo = Math.round(rapidoRaw);
  const rapidoSplit = Math.round(rapidoSolo / 2);

  const formattedTimeIST = istDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: true
  }) + ' IST';

  session.midpoint = {
    name: midpointName,
    lat: midLat,
    lng: midLng,
    distanceFromUser: `${distMetersUser} meters`,
    distanceFromPartner: `${distMetersPartner} meters`,
    walkingTimeUser: `${walkMinUser} min walk`,
    walkingTimePartner: `${walkMinPartner} min walk`,
    advantageNote: 'Equidistant pick-up spot calculated between both riders for a 50/50 split.'
  };

  session.fareComparison = {
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
      bookingUrl: `https://m.uber.com/ul/?action=setPickup&client_id=waygo_pool&pickup[latitude]=${midLat}&pickup[longitude]=${midLng}&pickup[nickname]=${encodeURIComponent(midpointName)}&dropoff[latitude]=${destLat}&dropoff[longitude]=${destLng}&dropoff[nickname]=${encodeURIComponent(destName)}`
    },
    ola: {
      service: 'Ola Mini / Prime',
      soloFare: olaSolo,
      splitFarePerPerson: olaSplit,
      savedPerPerson: olaSolo - olaSplit,
      rateBreakdown: `Base ₹45 + ₹16.8/km + ₹1.5/min • ${trafficCondition}`,
      bookingUrl: `https://book.olacabs.com/?lat=${midLat}&lng=${midLng}&pickup_name=${encodeURIComponent(midpointName)}&drop_lat=${destLat}&drop_lng=${destLng}&drop_name=${encodeURIComponent(destName)}`
    },
    rapido: {
      service: 'Rapido Cab Eco',
      soloFare: rapidoSolo,
      splitFarePerPerson: rapidoSplit,
      savedPerPerson: rapidoSolo - rapidoSplit,
      rateBreakdown: `Base ₹35 + ₹13.5/km + ₹1.2/min • Economy Tier`,
      bookingUrl: `https://rapido.bike/ride?pickup_lat=${midLat}&pickup_lng=${midLng}&pickup_address=${encodeURIComponent(midpointName)}&drop_lat=${destLat}&drop_lng=${destLng}&drop_address=${encodeURIComponent(destName)}`
    }
  };
}

// Endpoint: Send Real Link Up Request to Another Device
app.post('/api/carpool/linkup/request', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { fromDeviceId, toDeviceId } = req.body;
    if (!isValidDeviceId(fromDeviceId) || !isValidDeviceId(toDeviceId)) return res.status(400).json({ success: false, message: 'Valid fromDeviceId and toDeviceId are required.' });
    const now = new Date().toISOString();
    const [{ data: sourceRow }, { data: targetRow }] = await Promise.all([
      supabaseAdmin!.from('carpool_presence').select('payload,user_id').eq('device_id', fromDeviceId).eq('user_id', req.authUserId!).gt('expires_at', now).maybeSingle(),
      supabaseAdmin!.from('carpool_presence').select('payload,user_id,spawned_by_device_id').eq('device_id', toDeviceId).gt('expires_at', now).maybeSingle()
    ]);
    if (!sourceRow) return res.status(403).json({ success: false, message: 'Sender device is not active for this account.' });
    if (!targetRow) return res.status(404).json({ success: false, message: 'The other commuter is no longer active on the network.' });
    const isOwnedTest = targetRow.user_id === req.authUserId && targetRow.spawned_by_device_id === fromDeviceId;
    if (targetRow.user_id === req.authUserId && !isOwnedTest) return res.status(400).json({ success: false, message: 'Cannot start a link up with your own device.' });
    const fromPresence = sourceRow.payload as LiveCommuterPresence;
    const targetPresence = targetRow.payload as LiveCommuterPresence;
    const requestId = `LNK-${crypto.randomUUID()}`;
    const session: LiveLinkUpSession = {
      id: requestId,
      fromDeviceId,
      fromUser: { username: fromPresence.username, email: fromPresence.email, pickup: fromPresence.pickup, drop: fromPresence.drop, coords: fromPresence.pickupCoords },
      toDeviceId,
      toUser: { username: targetPresence.username, email: targetPresence.email, pickup: targetPresence.pickup, drop: targetPresence.drop, coords: targetPresence.pickupCoords },
      status: 'pending',
      createdAt: Date.now()
    };
    if (isOwnedTest) computeAndAcceptLinkUp(session);
    const { error } = await supabaseAdmin!.from('carpool_linkup_sessions').insert({
      request_id: requestId, from_user_id: req.authUserId, to_user_id: targetRow.user_id,
      from_device_id: fromDeviceId, to_device_id: toDeviceId, status: session.status, session,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
    if (error) throw error;
    return res.json({ success: true, message: session.status === 'accepted' ? 'Link Up accepted! Both devices are synchronized.' : 'Link Up request sent to ' + targetPresence.username, requestId, session });
  } catch (error: any) {
    console.error('Failed to initiate link up:', {
      code: error?.code,
      message: error?.message || 'Unknown database or server error',
      hint: error?.hint
    });
    return res.status(500).json({ success: false, message: 'Failed to initiate link up.' });
  }
});
// Endpoint: Poll for Incoming Link Up Requests
app.get('/api/carpool/linkup/incoming', async (req: AuthenticatedRequest, res: Response) => {
  const deviceId = req.query.deviceId as string;
  if (!isValidDeviceId(deviceId)) return res.status(400).json({ success: false, message: 'Valid deviceId is required.' });
  const { data, error } = await supabaseAdmin!.from('carpool_linkup_sessions')
    .select('session').eq('to_user_id', req.authUserId!).eq('to_device_id', deviceId)
    .eq('status', 'pending').gt('expires_at', new Date().toISOString());
  if (error) return res.status(500).json({ success: false, message: 'Could not fetch incoming requests.' });
  return res.json({ success: true, incoming: (data || []).map((row) => row.session) });
});

app.post('/api/carpool/linkup/respond', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestId, action, deviceId } = req.body;
    if (typeof requestId !== 'string' || !isValidDeviceId(deviceId) || !['accepted', 'declined'].includes(action)) return res.status(400).json({ success: false, message: 'Valid requestId, deviceId, and action are required.' });
    const { data: row } = await supabaseAdmin!.from('carpool_linkup_sessions').select('*')
      .eq('request_id', requestId).eq('to_user_id', req.authUserId!).eq('to_device_id', deviceId)
      .eq('status', 'pending').gt('expires_at', new Date().toISOString()).maybeSingle();
    if (!row) return res.status(404).json({ success: false, message: 'Request expired or not found.' });
    const session = row.session as LiveLinkUpSession;
    session.status = action;
    if (action === 'accepted') computeAndAcceptLinkUp(session);
    const { data: changed, error } = await supabaseAdmin!.from('carpool_linkup_sessions').update({ status: action, session })
      .eq('request_id', requestId).eq('to_user_id', req.authUserId!).eq('status', 'pending').select('request_id').maybeSingle();
    if (error) throw error;
    if (!changed) return res.status(409).json({ success: false, message: 'Request was already handled.' });
    return res.json({ success: true, message: action === 'declined' ? 'Request declined.' : 'Link Up accepted! Both devices are synchronized.', session });
  } catch (error) {
    console.error('Failed to respond to link up:', error);
    return res.status(500).json({ success: false, message: 'Failed to respond to link up.' });
  }
});

app.get('/api/carpool/linkup/session/:requestId', async (req: AuthenticatedRequest, res: Response) => {
  const { data, error } = await supabaseAdmin!.from('carpool_linkup_sessions').select('session')
    .eq('request_id', req.params.requestId).or(`from_user_id.eq.${req.authUserId},to_user_id.eq.${req.authUserId}`)
    .gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error || !data) return res.status(404).json({ success: false, message: 'Session not found.' });
  return res.json({ success: true, session: data.session });
});
// Endpoint: Cancel an Accepted / Confirmed Link Up Session
app.post('/api/carpool/linkup/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestId, cancelledByDeviceId } = req.body || {};
    if (typeof requestId !== 'string' || !isValidDeviceId(cancelledByDeviceId)) return res.status(400).json({ success: false, message: 'requestId and a valid cancelledByDeviceId are required.' });
    const { data: row } = await supabaseAdmin!.from('carpool_linkup_sessions').select('*')
      .eq('request_id', requestId).or(`from_user_id.eq.${req.authUserId},to_user_id.eq.${req.authUserId}`)
      .gt('expires_at', new Date().toISOString()).maybeSingle();
    if (!row) return res.status(404).json({ success: false, message: 'Session not found.' });
    const ownsFrom = row.from_user_id === req.authUserId && row.from_device_id === cancelledByDeviceId;
    const ownsTo = row.to_user_id === req.authUserId && row.to_device_id === cancelledByDeviceId;
    if (!ownsFrom && !ownsTo) return res.status(403).json({ success: false, message: 'Device does not belong to this session.' });
    const session = row.session as LiveLinkUpSession;
    session.status = 'cancelled'; session.cancelledAt = Date.now(); session.cancelledBy = req.authUsername || 'Partner';
    const { error } = await supabaseAdmin!.from('carpool_linkup_sessions').update({ status: 'cancelled', session })
      .eq('request_id', requestId).eq('from_user_id', row.from_user_id).eq('to_user_id', row.to_user_id);
    if (error) throw error;
    return res.json({ success: true, requestId });
  } catch (error) {
    console.error('Failed to cancel link up:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel link up.' });
  }
});
app.post('/api/carpool/call/signal', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const signal = req.body;
    const validKinds = ['call_invite', 'call_answer', 'call_ice', 'call_reject', 'call_end', 'call_busy'];
    if (!isValidDeviceId(signal?.fromDeviceId) || !isValidDeviceId(signal?.toDeviceId) || !signal?.callId || !validKinds.includes(signal?.kind)) {
      return res.status(400).json({ success: false, message: 'Valid call signal payload is required.' });
    }
    const { data: source } = await supabaseAdmin!.from('carpool_presence').select('payload')
      .eq('device_id', signal.fromDeviceId).eq('user_id', req.authUserId!).gt('expires_at', new Date().toISOString()).maybeSingle();
    const { data: target } = await supabaseAdmin!.from('carpool_presence').select('user_id')
      .eq('device_id', signal.toDeviceId).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (!source || !target || target.user_id === req.authUserId) return res.status(403).json({ success: false, message: 'Call devices are not active or authorized.' });
    const { data: link } = await supabaseAdmin!.from('carpool_linkup_sessions').select('request_id')
      .eq('status', 'accepted').or(`and(from_device_id.eq.${signal.fromDeviceId},to_device_id.eq.${signal.toDeviceId}),and(from_device_id.eq.${signal.toDeviceId},to_device_id.eq.${signal.fromDeviceId})`)
      .gt('expires_at', new Date().toISOString()).limit(1).maybeSingle();
    if (!link) return res.status(403).json({ success: false, message: 'Calls require an accepted link-up session.' });
    const fromPresence = source.payload as LiveCommuterPresence;
    const safeSignal = { ...signal, fromUser: { username: fromPresence.username, email: fromPresence.email } };
    const { error } = await supabaseAdmin!.from('carpool_call_signals').insert({
      signal_id: String(signal.signalId || crypto.randomUUID()),
      from_user_id: req.authUserId,
      to_user_id: target.user_id,
      from_device_id: signal.fromDeviceId,
      to_device_id: signal.toDeviceId,
      payload: safeSignal,
      expires_at: new Date(Date.now() + 45_000).toISOString()
    });
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('Failed to relay call signal:', error);
    return res.status(500).json({ success: false, message: 'Failed to relay call signal.' });
  }
});

app.get('/api/carpool/call/pending', async (req: AuthenticatedRequest, res: Response) => {
  const deviceId = (req.query.deviceId as string) || '';
  if (!isValidDeviceId(deviceId)) return res.status(400).json({ success: false, message: 'Valid deviceId is required.' });
  const { data: ownDevice } = await supabaseAdmin!.from('carpool_presence').select('device_id')
    .eq('device_id', deviceId).eq('user_id', req.authUserId!).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!ownDevice) return res.status(403).json({ success: false, message: 'Device is not active for this account.' });
  const { data: signals, error } = await supabaseAdmin!.from('carpool_call_signals').select('signal_id,payload')
    .eq('to_user_id', req.authUserId!).eq('to_device_id', deviceId).gt('expires_at', new Date().toISOString());
  if (error) return res.status(500).json({ success: false, message: 'Could not fetch call signals.' });
  const ids = (signals || []).map((signal) => signal.signal_id);
  if (ids.length) await supabaseAdmin!.from('carpool_call_signals').delete().eq('to_user_id', req.authUserId!).in('signal_id', ids);
  return res.json({ success: true, signals: (signals || []).map((signal) => signal.payload) });
});
// Ensure unmatched /api/* routes always return JSON instead of falling through to SPA HTML
app.all('/api/*', (_req: Request, res: Response) => {
  return res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

// Global JSON error handler for API requests
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/')) {
    console.error('[API Error]:', err);
    return res.status(err?.status || 500).json({
      success: false,
      message: err?.message || 'Internal server error.'
    });
  }
  return next(err);
});

async function startServer() {
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[WayGo Server] Running on http://localhost:${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
