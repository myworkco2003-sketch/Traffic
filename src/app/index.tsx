import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Map,
  Camera,
  ViewAnnotation,
  type CameraRef,
} from '@maplibre/maplibre-react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import mapStyleJson from '../../assets/style.json';
import { Pin } from '../components/Pin';
import {
  MAP_BOUNDS,
  useTrip,
  type LngLat,
  type PointKind,
  type TripPoint,
} from '../state/TripContext';

const DAMASCUS_CENTER: LngLat = [36.2913, 33.5138];

const COLORS: Record<PointKind, string> = {
  origin: '#2E9B70', // أخضر
  destination: '#E5484D', // أحمر
};

const LABELS: Record<PointKind, string> = {
  origin: 'نقطة الانطلاق',
  destination: 'الوجهة',
};

const HINTS: Record<PointKind, string> = {
  origin: 'اضغط على الخريطة لتحديد نقطة الانطلاق، أو استخدم موقعك',
  destination: 'اضغط على الخريطة لتحديد الوجهة',
};

const ERROR_MESSAGES = {
  denied: 'لم يتم منح إذن الموقع. يمكنك تحديد نقطتك بالضغط على الخريطة.',
  blocked: 'إذن الموقع مرفوض. فعّله من إعدادات الجهاز أو حدّد نقطتك على الخريطة.',
  unavailable: 'تعذّر تحديد موقعك. تأكد من تشغيل GPS أو حدّد نقطتك على الخريطة.',
  outside: 'هذا الموقع خارج نطاق خريطة دمشق المتاحة.',
} as const;

export default function Index() {
  const [offlineStyle, setOfflineStyle] = useState<any>(null);

  // نقطتا الرحلة (مشتركتان بين كل الشاشات عبر TripProvider)
  const { origin, destination, locating, error, setPoint, locateMe, clearPoint } =
    useTrip();

  // أي نقطة نحددها بالضغط على الخريطة الآن
  const [activeKind, setActiveKind] = useState<PointKind>('origin');
  const [cardHeight, setCardHeight] = useState(0);

  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function setupOfflineMap() {
      try {
        
        // 1. تحميل ملف MBTiles المحلي
        const mbtilesAsset = Asset.fromModule(
          require('../../assets/damascus.mbtiles')
        );

        await mbtilesAsset.downloadAsync();

        const dbPath = mbtilesAsset.localUri?.replace(
          'file://',
          ''
        );

        if (!dbPath) {
          throw new Error('MBTiles database path was not found.');
        }

        // 2. تجهيز مجلد الخطوط
        const fontDir =
          `${FileSystem.documentDirectory}fonts/Noto Sans Bold/`;

        const dirInfo = await FileSystem.getInfoAsync(fontDir);

        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(fontDir, {
            intermediates: true,
          });
        }

        // 3. تحميل ملفات Glyphs المحلية الموجودة حالياً
        const glyphFiles = [
          {
            asset: Asset.fromModule(
              require(
                '../../assets/fonts/Noto Sans Bold/0-255.pbf'
              )
            ),
            fileName: '0-255.pbf',
          },
          {
            asset: Asset.fromModule(
              require(
                '../../assets/fonts/Noto Sans Bold/1536-1791.pbf'
              )
            ),
            fileName: '1536-1791.pbf',
          },
        ];

        for (const glyph of glyphFiles) {
          await glyph.asset.downloadAsync();

          if (glyph.asset.localUri) {
            const destination =
              `${fontDir}${glyph.fileName}`;

            await FileSystem.copyAsync({
              from: glyph.asset.localUri,
              to: destination,
            });
          }
        }

        // 4. إنشاء نسخة من style.json
        const dynamicStyle = JSON.parse(
          JSON.stringify(mapStyleJson)
        );

        // =====================================================
        // 5. تعديل جميع طبقات النصوص
        // =====================================================
        dynamicStyle.layers = dynamicStyle.layers.map(
          (layer: any) => {

            // -------------------------------------------------
            // استخدام Noto Sans Bold للطبقات التي تحتوي
            // على text-font
            // -------------------------------------------------
            if (
              layer.type === 'symbol' &&
              layer.layout?.['text-font']
            ) {
              layer.layout['text-font'] = ['Noto Sans Bold'];
            }

            // -------------------------------------------------
            // تعديل طبقات الأسماء فقط
            //
            // نبحث داخل text-field نفسه عن:
            // name:en أو name
            //
            // إذا كانت الطبقة تعرض اسماً:
            // Arabic → name → English
            // -------------------------------------------------
            if (
              layer.type === 'symbol' &&
              layer.layout?.['text-field']
            ) {
              const textField = JSON.stringify(
                layer.layout['text-field']
              );

              const isNameLayer =
                textField.includes('name:en') ||
                textField.includes('"name"');

              if (isNameLayer) {
                layer.layout['text-field'] = [
                  'coalesce',
                  ['get', 'name:ar'],
                  ['get', 'name'],
                  ['get', 'name:en'],
                ];
              }
            }

            // -------------------------------------------------
            // إصلاح warning "Invalid geometry in line layer":
            // طبقة park بالـtiles فيها Polygon + Point (نقاط أسماء
            // المتنزهات)، وطبقات الـline عندنا بلا filter فبتاخد
            // النقاط كمان. نستثني النقاط.
            // -------------------------------------------------
            if (layer.type === 'line' && !layer.filter) {
              layer.filter = ['!=', '$type', 'Point'];
            }

            return layer;
          }
        );

        // 6. استخدام MBTiles المحلي
        dynamicStyle.sources.openmaptiles.url =
          `mbtiles://${dbPath}`;

        // 7. الحد الأقصى للـZoom
        dynamicStyle.sources.openmaptiles.maxzoom = 14;

        // 8. استخدام Glyphs من MapTiler مؤقتاً
        //
        // الـTiles محلية من damascus.mbtiles
        // لكن الـGlyphs حالياً من المصدر الأصلي.
        dynamicStyle.glyphs = mapStyleJson.glyphs;

        // 9. حفظ الـStyle المعدل
        setOfflineStyle(dynamicStyle);

      } catch (error) {
        console.error(
          'Failed to load offline map assets:',
          error
        );
      }
    }

    setupOfflineMap();
  }, []);

  // شاشة التحميل
  if (!offlineStyle) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Loading offline map...
        </Text>
      </View>
    );
  }


  // تكبير الخريطة لتظهر النقطتان معاً
  const fitBoth = (a: LngLat, b: LngLat) => {
    cameraRef.current?.fitBounds(
      [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ],
      {
        padding: { top: 160, right: 60, bottom: 240, left: 60 },
        duration: 600,
      },
    );
  };

  const handleMapPress = (lngLat: LngLat) => {
    const ok = setPoint(activeKind, lngLat);
    if (!ok) return;

    const other = activeKind === 'origin' ? destination : origin;
    if (other) {
      fitBoth(lngLat, other.lngLat);
    } else if (activeKind === 'origin') {
      // بعد الانطلاق ننتقل تلقائياً لتحديد الوجهة
      setActiveKind('destination');
    }
  };

  const handleLocate = async () => {
    const result = await locateMe();
    if (!result) return;

    if (destination) {
      fitBoth(result.lngLat, destination.lngLat);
    } else {
      setActiveKind('destination');
      cameraRef.current?.flyTo({ center: result.lngLat, zoom: 16, duration: 800 });
    }
  };

  const showCard = origin !== null || destination !== null;
  const cardSpace = showCard ? cardHeight + 12 : 8;

  // الخريطة
  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={offlineStyle}
        logo={false}
        attribution={false}
        onPress={(event) => handleMapPress(event.nativeEvent.lngLat as LngLat)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: DAMASCUS_CENTER,
            zoom: 13,
          }}
          minZoom={9}
          maxBounds={MAP_BOUNDS}
        />

        {origin && (
          <ViewAnnotation
            id="origin"
            lngLat={origin.lngLat}
            anchor="bottom"
            draggable
            onDragEnd={(event) =>
              setPoint('origin', event.nativeEvent.lngLat as LngLat)
            }
          >
            <Pin color={COLORS.origin} />
          </ViewAnnotation>
        )}

        {destination && (
          <ViewAnnotation
            id="destination"
            lngLat={destination.lngLat}
            anchor="bottom"
            draggable
            onDragEnd={(event) =>
              setPoint('destination', event.nativeEvent.lngLat as LngLat)
            }
          >
            <Pin color={COLORS.destination} />
          </ViewAnnotation>
        )}
      </Map>

      {/* اختيار النقطة الحالية + التعليمات/الأخطاء */}
      <View style={[styles.topPanel, { top: insets.top + 12 }]}>
        <View style={styles.chips}>
          {(['origin', 'destination'] as const).map((kind) => {
            const active = activeKind === kind;
            const isSet = kind === 'origin' ? origin !== null : destination !== null;
            return (
              <Pressable
                key={kind}
                style={[
                  styles.chip,
                  active && { backgroundColor: COLORS[kind], borderColor: COLORS[kind] },
                ]}
                onPress={() => setActiveKind(kind)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {isSet ? '✓ ' : ''}
                  {LABELS[kind]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.bannerText}>
          {error ? ERROR_MESSAGES[error] : HINTS[activeKind]}
        </Text>
        {error === 'blocked' && (
          <Pressable onPress={() => Linking.openSettings()}>
            <Text style={styles.bannerLink}>فتح الإعدادات</Text>
          </Pressable>
        )}
      </View>

      {/* زر GPS (لنقطة الانطلاق فقط) */}
      <Pressable
        style={[styles.locateButton, { bottom: insets.bottom + 16 + cardSpace }]}
        onPress={handleLocate}
        disabled={locating}
        accessibilityLabel="استخدم موقعي الحالي كنقطة انطلاق"
      >
        <Text style={styles.locateButtonText}>
          {locating ? '...' : '📍 موقعي'}
        </Text>
      </Pressable>

      {/* بطاقة النقطتين */}
      {showCard && (
        <View
          style={[styles.card, { bottom: insets.bottom + 16 }]}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        >
          <PointRow
            kind="origin"
            point={origin}
            onClear={() => {
              clearPoint('origin');
              setActiveKind('origin');
            }}
          />
          <View style={styles.divider} />
          <PointRow
            kind="destination"
            point={destination}
            onClear={() => {
              clearPoint('destination');
              setActiveKind('destination');
            }}
          />
        </View>
      )}
    </View>
  );
}

function PointRow({
  kind,
  point,
  onClear,
}: {
  kind: PointKind;
  point: TripPoint | null;
  onClear: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowDot, { backgroundColor: COLORS[kind] }]} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>
          {LABELS[kind]}
          {point ? ` (${point.source === 'gps' ? 'GPS' : 'من الخريطة'})` : ''}
        </Text>
        {point ? (
          <Text style={styles.rowCoords}>
            {point.lngLat[1].toFixed(5)}, {point.lngLat[0].toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.rowEmpty}>لم تُحدد بعد</Text>
        )}
        {point?.accuracy != null && point.accuracy > 100 && (
          <Text style={styles.rowWarning}>
            دقة الموقع منخفضة (±{Math.round(point.accuracy)} م) — اسحب المؤشر لتصحيحه
          </Text>
        )}
      </View>
      {point && (
        <Pressable onPress={onClear} accessibilityLabel={`إلغاء ${LABELS[kind]}`}>
          <Text style={styles.clearText}>إلغاء</Text>
        </Pressable>
      )}
    </View>
  );
}

// تنسيقات الشاشة
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  map: { flex: 1 },
  center: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: 'white' },

  topPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  chips: { flexDirection: 'row-reverse', gap: 8, marginBottom: 10 },
  chip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
  },
  chipText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: 'white' },
  bannerText: { color: 'white', fontSize: 13, textAlign: 'right' },
  bannerLink: { color: '#7CC0FF', marginTop: 6, textAlign: 'right' },

  locateButton: {
    position: 'absolute',
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#208AEF',
  },
  locateButtonText: { color: 'white', fontWeight: '600' },

  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'white',
  },
  divider: { height: 1, backgroundColor: '#E5E5E5', marginVertical: 10 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  rowDot: { width: 12, height: 12, borderRadius: 6 },
  rowInfo: { flex: 1 },
  rowTitle: { fontWeight: '600', textAlign: 'right' },
  rowCoords: { color: '#555', marginTop: 2, textAlign: 'right' },
  rowEmpty: { color: '#999', marginTop: 2, textAlign: 'right' },
  rowWarning: { color: '#B54B45', marginTop: 4, fontSize: 12, textAlign: 'right' },
  clearText: { color: '#B54B45', fontWeight: '600', paddingHorizontal: 8 },
});
