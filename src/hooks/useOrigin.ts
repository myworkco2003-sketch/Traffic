import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

/** [longitude, latitude] — نفس ترتيب MapLibre */
export type LngLat = [longitude: number, latitude: number];

export type OriginSource = 'gps' | 'map';

export type Origin = {
  lngLat: LngLat;
  source: OriginSource;
  /** دقة GPS بالمتر (فقط عند source === 'gps') */
  accuracy?: number;
};

export type OriginError =
  | 'denied' // رفض المستخدم الإذن (يمكن السؤال مرة ثانية)
  | 'blocked' // رفض نهائي — لازم من إعدادات الجهاز
  | 'unavailable' // GPS مطفأ أو فشل الحصول على الموقع
  | 'outside'; // خارج تغطية خريطة دمشق الأوفلاين

// حدود damascus.mbtiles (من جدول metadata): west, south, east, north
const BOUNDS = { west: 35.841, south: 33.112, east: 36.73, north: 33.805 };

export const isInsideCoverage = ([lng, lat]: LngLat) =>
  lng >= BOUNDS.west &&
  lng <= BOUNDS.east &&
  lat >= BOUNDS.south &&
  lat <= BOUNDS.north;

export function useOrigin() {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<OriginError | null>(null);

  /** تحديد نقطة الانطلاق يدوياً (ضغط على الخريطة أو سحب المؤشر) */
  const setFromMap = useCallback((lngLat: LngLat) => {
    if (!isInsideCoverage(lngLat)) {
      setError('outside');
      return;
    }
    setError(null);
    setOrigin({ lngLat, source: 'map' });
  }, []);

  /** تحديد نقطة الانطلاق من GPS. يرجّع الـOrigin عند النجاح أو null. */
  const locateMe = useCallback(async (): Promise<Origin | null> => {
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

      const next: Origin = {
        lngLat,
        source: 'gps',
        accuracy: position.coords.accuracy ?? undefined,
      };
      setOrigin(next);
      return next;
    } catch {
      setError('unavailable');
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

  const clear = useCallback(() => {
    setOrigin(null);
    setError(null);
  }, []);

  return { origin, locating, error, setFromMap, locateMe, clear };
}
