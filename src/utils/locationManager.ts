export type LocationSource = 'gps' | 'ip' | 'manual' | 'default';
export type LocationStatus = 'acquiring' | 'active' | 'degraded' | 'unavailable' | 'permission_denied';

export interface ManagedLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  source: 'gps';
}

export interface LocationState {
  status: LocationStatus;
  fix?: ManagedLocation;
  error?: GeolocationPositionError['code'];
}

const validCoordinates = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export class BrowserLocationManager {
  private watchId: number | null = null;
  private permissionStatus: PermissionStatus | null = null;
  private lastFix: ManagedLocation | null = null;
  private jumpCandidate: ManagedLocation | null = null;
  private jumpCandidateCount = 0;
  private callbacks = new Set<(state: LocationState) => void>();
  private started = false;
  private freshnessTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  subscribe(callback: (state: LocationState) => void) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const generation = ++this.generation;
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('online', this.handleOnline);
    this.emit({ status: 'acquiring' });
    if (!navigator.geolocation) {
      this.emit({ status: 'unavailable' });
      return;
    }
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        if (!this.started || generation !== this.generation) return;
        this.permissionStatus = permission;
        permission.addEventListener('change', this.handlePermissionChange);
        if (permission.state === 'denied') this.stopWatch('permission_denied');
        else this.startWatch();
      }).catch(() => this.startWatch());
    } else {
      this.startWatch();
    }
  }

  refresh() {
    if (!this.started) {
      this.start();
      return;
    }
    if (!navigator.geolocation) {
      this.emit({ status: 'unavailable' });
      return;
    }
    this.stopWatch();
    this.emit({ status: 'acquiring', fix: this.getFreshFix() || undefined });
    this.startWatch(true);
  }

  stop() {
    this.started = false;
    this.generation += 1;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('online', this.handleOnline);
    this.permissionStatus?.removeEventListener('change', this.handlePermissionChange);
    this.permissionStatus = null;
    this.stopWatch();
    if (this.freshnessTimer) clearTimeout(this.freshnessTimer);
    this.freshnessTimer = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  getFreshFix(maxAgeMs = 60_000) {
    return this.lastFix && Date.now() - this.lastFix.timestamp <= maxAgeMs ? this.lastFix : null;
  }

  private emit(state: LocationState) {
    this.callbacks.forEach((callback) => callback(state));
  }

  private stopWatch(status?: LocationStatus) {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (status) this.emit({ status, error: status === 'permission_denied' ? 1 : undefined });
  }

  private startWatch(forceFresh = false) {
    if (!this.started || this.watchId !== null || !navigator.geolocation || document.visibilityState === 'hidden') return;
    if (this.permissionStatus?.state === 'denied') {
      this.emit({ status: 'permission_denied', error: 1 });
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        const timestamp = position.timestamp || Date.now();
        if (!validCoordinates(lat, lng) || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 5000) return;
        if (Date.now() - timestamp > 120_000) return;
        const previous = this.lastFix;
        if (previous && timestamp <= previous.timestamp) return;
        if (previous) {
          const elapsed = Math.max(1, (timestamp - previous.timestamp) / 1000);
          const meters = this.distance(previous.lat, previous.lng, lat, lng);
          if (meters < 10 && elapsed < 10 && accuracy >= previous.accuracy * 0.75) return;
          const uncertainty = previous.accuracy + accuracy;
          if (meters - uncertainty > Math.max(250, elapsed * 80)) {
            const candidate: ManagedLocation = { lat, lng, accuracy: Math.round(accuracy), timestamp, source: 'gps' };
            if (this.jumpCandidate && this.distance(this.jumpCandidate.lat, this.jumpCandidate.lng, lat, lng) <= Math.max(100, this.jumpCandidate.accuracy + accuracy) && timestamp > this.jumpCandidate.timestamp) {
              this.jumpCandidateCount += 1;
              this.jumpCandidate = candidate;
              if (this.jumpCandidateCount < 2) {
                this.emit({ status: 'degraded', fix: previous, error: 2 });
                return;
              }
            } else {
              this.jumpCandidate = candidate;
              this.jumpCandidateCount = 0;
              this.emit({ status: 'degraded', fix: this.getFreshFix() || undefined, error: 2 });
              return;
            }
          } else {
            this.jumpCandidate = null;
            this.jumpCandidateCount = 0;
          }
        }
        this.lastFix = { lat, lng, accuracy: Math.round(accuracy), timestamp, source: 'gps' };
        if (this.freshnessTimer) clearTimeout(this.freshnessTimer);
        this.freshnessTimer = setTimeout(() => {
          if (this.lastFix && Date.now() - this.lastFix.timestamp > 90_000) {
            this.emit({ status: 'unavailable' });
          }
        }, 90_000);
        this.emit({ status: accuracy > 100 ? 'degraded' : 'active', fix: this.lastFix });
      },
      (error) => {
        if (!this.started) return;
        const status: LocationStatus = error.code === 1 ? 'permission_denied' : 'unavailable';
        this.stopWatch();
        this.emit({ status, fix: this.getFreshFix() || undefined, error: error.code });
        if (error.code !== 1 && this.started) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.startWatch(true);
          }, 30_000);
        }
      },
      { enableHighAccuracy: true, maximumAge: forceFresh ? 0 : 10_000, timeout: 25_000 }
    );
  }

  private handlePermissionChange = () => {
    if (this.permissionStatus?.state === 'denied') this.stopWatch('permission_denied');
    else this.startWatch(true);
  };

  private handleVisibility = () => {
    if (document.visibilityState === 'hidden') this.stopWatch('degraded');
    else if (this.started) {
      this.emit({ status: 'acquiring', fix: this.getFreshFix() || undefined });
      this.startWatch(true);
    }
  };

  private handleOnline = () => {
    if (!this.started) return;
    this.emit({ status: 'acquiring', fix: this.getFreshFix() || undefined });
    this.startWatch(true);
  };

  private distance(lat1: number, lng1: number, lat2: number, lng2: number) {
    const r = 6_371_000;
    const rad = (value: number) => value * Math.PI / 180;
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
