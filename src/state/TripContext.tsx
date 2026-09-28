import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as Location from 'expo-location';

/** [longitude, latitude] — نفس ترتيب MapLibre */
export type LngLat = [longitude: number, latitude: number];

export type PointSource = 'gps' | 'map';
export type PointKind = 'origin' | 'destination';

export type TripPoint = {
  lngLat: LngLat;
  source: PointSource;
  /** دقة GPS بالمتر (فقط عند source === 'gps') */
  accuracy?: number;
};

export type TripError =
  | 'denied' // رفض المستخدم الإذن (يمكن السؤال مرة ثانية)
  | 'blocked' // رفض نهائي — لازم من إعدادات الجهاز
  | 'unavailable' // GPS مطفأ أو فشل الحصول على الموقع
  | 'outside'; // خارج تغطية خريطة دمشق الأوفلاين

// حدود damascus.mbtiles (من جدول metadata): [west, south, east, north]
export const MAP_BOUNDS: [number, number, number, number] = [
  35.6, 32.3, 42.4, 37.4,
];

export const isInsideCoverage = ([lng, lat]: LngLat) =>
  lng >= MAP_BOUNDS[0] &&
  lng <= MAP_BOUNDS[2] &&
  lat >= MAP_BOUNDS[1] &&
  lat <= MAP_BOUNDS[3];

type TripContextValue = {
  /** نقطة الانطلاق (null إذا لم تُحدد) */
  origin: TripPoint | null;
  /** نقطة الوجهة (null إذا لم تُحدد) */
  destination: TripPoint | null;
  locating: boolean;
  error: TripError | null;
  /**
   * تحديد نقطة يدوياً (ضغط أو سحب على الخريطة).
   * يرجّع true إذا انقبلت النقطة، false إذا كانت خارج التغطية.
   */
  setPoint: (kind: PointKind, lngLat: LngLat) => boolean;
  /** تحديد نقطة الانطلاق من GPS. يرجّع النقطة أو null عند الفشل. */
  locateMe: () => Promise<TripPoint | null>;
  clearPoint: (kind: PointKind) => void;
  clearAll: () => void;
};

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [origin, setOrigin] = useState<TripPoint | null>(null);
  const [destination, setDestination] = useState<TripPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<TripError | null>(null);

  const setPoint = useCallback((kind: PointKind, lngLat: LngLat) => {
    if (!isInsideCoverage(lngLat)) {
      setError('outside');
      return false;
    }
    setError(null);
    const point: TripPoint = { lngLat, source: 'map' };
    if (kind === 'origin') setOrigin(point);
    else setDestination(point);
    return true;
  }, []);

  const locateMe = useCallback(async (): Promise<TripPoint | null> => {
    setLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError(permission.canAskAgain ? 'denied' : 'blocked');
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const lngLat: LngLat = [
        position.coords.longitude,
        position.coords.latitude,
      ];

      if (!isInsideCoverage(lngLat)) {
        setError('outside');
        return null;
      }

      const point: TripPoint = {
        lngLat,
        source: 'gps',
        accuracy: position.coords.accuracy ?? undefined,
      };
      setOrigin(point);
      return point;
    } catch {
      setError('unavailable');
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

  const clearPoint = useCallback((kind: PointKind) => {
    setError(null);
    if (kind === 'origin') setOrigin(null);
    else setDestination(null);
  }, []);

  const clearAll = useCallback(() => {
    setError(null);
    setOrigin(null);
    setDestination(null);
  }, []);

  const value = useMemo(
    () => ({
      origin,
      destination,
      locating,
      error,
      setPoint,
      locateMe,
      clearPoint,
      clearAll,
    }),
    [origin, destination, locating, error, setPoint, locateMe, clearPoint, clearAll],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

/** الوصول لنقطتي الانطلاق والوجهة من أي شاشة أو كومبوننت داخل TripProvider */
export function useTrip() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTrip must be used inside <TripProvider>');
  return ctx;
}
