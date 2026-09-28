
import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  View,
  Text,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Map,
  Camera,
  ViewAnnotation,
  GeoJSONSource,
  Layer,
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
import searchIndex from '../../assets/search-index.json';
const DAMASCUS_CENTER: LngLat = [36.2913, 33.5138];

const COLORS: Record<PointKind, string> = {
  origin: '#2E9B70',
  destination: '#E5484D',
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

type SearchItem = { name?: string; nameAr?: string; nameEn?: string; kind?: string; longitude: number; latitude: number; }; const SEARCH_DATA = searchIndex as SearchItem[];

/* =========================================================
   Route types
========================================================= */

type RouteStep = {
  step_order: number;
  edge_type: 'walk' | 'transfer' | 'bus';
  route_name: string;
  duration_minutes: number;
  geojson: string;
};

type RouteResponse = {
  steps: RouteStep[];
};

/* =========================================================
   Temporary Mock Backend Response

   لاحقاً سيتم استبدال هذا الجزء بالـ API الحقيقي.
========================================================= */

const MOCK_ROUTE_RESPONSE: RouteResponse = {
  steps: [
    {
      step_order: 1,
      edge_type: 'walk',
      route_name: 'Walking Path',
      duration_minutes: 1.0,
      geojson:
        '{"type":"LineString","coordinates":[[36.2892282,33.5135877],[36.2891276,33.5136801],[36.2891068,33.5136974],[36.2890816,33.5137103],[36.289049,33.5137188],[36.2890692,33.5137431],[36.2890944,33.513764],[36.2891193,33.5137786],[36.2891467,33.5137897],[36.2893103,33.5138456],[36.2893586,33.5138557],[36.2894179,33.5138626],[36.2894248,33.5138327],[36.2894333,33.5138132],[36.289449,33.5137975],[36.2894671,33.5137867],[36.2894203,33.5137293],[36.289368,33.5136779]]}',
    },
    {
      step_order: 2,
      edge_type: 'transfer',
      route_name: 'Walk/Wait Transfer',
      duration_minutes: 2.0,
      geojson:
        '{"type":"LineString","coordinates":[[36.289228,33.513588],[36.2892282,33.5135877]]}',
    },
    {
      step_order: 3,
      edge_type: 'bus',
      route_name: 'Jisr Alhuryah - Dahiyat Qudsaiya Gharbiah',
      duration_minutes: 4.0,
      geojson:
        '{"type":"LineString","coordinates":[[36.289228,33.513588],[36.288959,33.513581],[36.2886875,33.513573],[36.288416,33.513565],[36.28797625,33.513552752],[36.2875365,33.513540503],[36.28709675,33.513528252],[36.286657,33.513516],[36.286219,33.513498501],[36.285781,33.513481],[36.28527975,33.513462503],[36.2847785,33.513444004],[36.28427725,33.513425503],[36.283776,33.513407],[36.28326575,33.513389753],[36.2827555,33.513372504],[36.28224525,33.513355253],[36.281735,33.513338],[36.2813645,33.513320501],[36.280994,33.513303],[36.2807095,33.51329],[36.280425,33.513277],[36.280018,33.513277],[36.279653,33.513285],[36.279288,33.513321],[36.279019,33.513374],[36.278574,33.513417],[36.278562,33.513419],[36.278277501,33.513479251],[36.277993001,33.513539501],[36.277708501,33.513599751],[36.277424,33.51366],[36.2771115,33.5137275],[36.276799,33.513795],[36.276277501,33.513884001],[36.275756,33.513973],[36.275443751,33.514038251],[36.275131501,33.514103502]]}',
    },
    {
      step_order: 4,
      edge_type: 'transfer',
      route_name: 'Walk/Wait Transfer',
      duration_minutes: 2.1,
      geojson:
        '{"type":"LineString","coordinates":[[36.275131501,33.514103502],[36.275148,33.5140154]]}',
    },
    {
      step_order: 5,
      edge_type: 'walk',
      route_name: 'Walking Path',
      duration_minutes: 1.2,
      geojson:
        '{"type":"LineString","coordinates":[[36.275148,33.5140154],[36.2751015,33.5139366],[36.2750985,33.5138478],[36.2751076,33.5136726],[36.275135,33.5134899],[36.2752149,33.5132967],[36.2753439,33.5132191]]}',
    },
  ],
};

export default function Index() {
  const [offlineStyle, setOfflineStyle] = useState<any>(null);

  // نقطتا الرحلة
  const {
    origin,
    destination,
    locating,
    error,
    setPoint,
    locateMe,
    clearPoint,
  } = useTrip();

  // أي نقطة نحددها بالضغط على الخريطة الآن
  const [activeKind, setActiveKind] =
    useState<PointKind>('origin');

  const [cardHeight, setCardHeight] = useState(0);

  // Search Bar
  const [searchText, setSearchText] = useState('');
  // المسار الناتج
  const [routeGeoJson, setRouteGeoJson] =
    useState<any>(null);

  // حالة حساب المسار
  const [loadingRoute, setLoadingRoute] =
    useState(false);

  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();

  /* =========================================================
     Offline Map Setup
  ========================================================= */

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
          throw new Error(
            'MBTiles database path was not found.'
          );
        }

        // 2. تجهيز مجلد الخطوط
        const fontDir =
          `${FileSystem.documentDirectory}fonts/Noto Sans Bold/`;

        const dirInfo =
          await FileSystem.getInfoAsync(fontDir);

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

        dynamicStyle.layers =
          dynamicStyle.layers.map((layer: any) => {

            // استخدام Noto Sans Bold
            if (
              layer.type === 'symbol' &&
              layer.layout?.['text-font']
            ) {
              layer.layout['text-font'] = [
                'Noto Sans Bold',
              ];
            }

            // تعديل طبقات الأسماء
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

            // منع نقاط الـ park من الدخول في line layers
            if (
              layer.type === 'line' &&
              !layer.filter
            ) {
              layer.filter = [
                '!=',
                '$type',
                'Point',
              ];
            }

            return layer;
          });

        // 6. استخدام MBTiles المحلي
        dynamicStyle.sources.openmaptiles.url =
          `mbtiles://${dbPath}`;

        // 7. الحد الأقصى للـZoom
        dynamicStyle.sources.openmaptiles.maxzoom = 14;

        // 8. Glyphs
        dynamicStyle.glyphs =
          mapStyleJson.glyphs;

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

  /* =========================================================
     Fit map to two points
  ========================================================= */

  const fitBoth = (
    a: LngLat,
    b: LngLat
  ) => {
    cameraRef.current?.fitBounds(
      [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[0], b[0]),
        Math.max(a[1], b[1]),
      ],
      {
        padding: {
          top: 160,
          right: 60,
          bottom: 240,
          left: 60,
        },
        duration: 600,
      }
    );
  };

  /* =========================================================
     Calculate Route
     
     حالياً Mock فقط.
     لاحقاً نستبدل response بالـ API.
  ========================================================= */

  const handleCalculateRoute = async () => {
    if (!origin || !destination) {
      return;
    }

    setLoadingRoute(true);

    try {
      /*
       * حالياً هذا يمثل Response من الـ Backend.
       *
       * لاحقاً سيكون مثلاً:
       *
       * const response = await fetch(...);
       * const data = await response.json();
       */

      const response = MOCK_ROUTE_RESPONSE;

      // تحويل كل GeoJSON إلى Feature
      const features = response.steps.map(
        (step) => ({
          type: 'Feature',
          properties: {
            step_order: step.step_order,
            edge_type: step.edge_type,
            route_name: step.route_name,
            duration_minutes:
              step.duration_minutes,
          },
          geometry: JSON.parse(step.geojson),
        })
      );

      // FeatureCollection لاستخدامها مع MapLibre
      const featureCollection = {
        type: 'FeatureCollection',
        features,
      };

      setRouteGeoJson(featureCollection);

      // حساب حدود المسار
      const coordinates = features.flatMap(
        (feature: any) =>
          feature.geometry.coordinates
      );

      if (coordinates.length > 0) {
        const lngs = coordinates.map(
          (coord: number[]) => coord[0]
        );

        const lats = coordinates.map(
          (coord: number[]) => coord[1]
        );

        cameraRef.current?.fitBounds(
          [
            Math.min(...lngs),
            Math.min(...lats),
            Math.max(...lngs),
            Math.max(...lats),
          ],
          {
            padding: {
              top: 180,
              right: 60,
              bottom: 280,
              left: 60,
            },
            duration: 800,
          }
        );
      }
    } catch (error) {
      console.error(
        'Failed to calculate route:',
        error
      );
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleSearchSelect = ( item: SearchItem ) => { const lngLat: LngLat = [ item.longitude, item.latitude, ]; 
  // إذا كان هناك Route قديم، نمسحه 
  setRouteGeoJson(null); 
  // تحديد النقطة الحالية 
  const ok = setPoint( activeKind, lngLat ); if (!ok) return; 
  // تحريك الخريطة للمكان 
  cameraRef.current?.flyTo({ center: lngLat, zoom: 16, duration: 800, }); 
  // إذا حددنا الانطلاق ننتقل تلقائيًا للوجهة 
  if (activeKind === 'origin') 
    { 
      setActiveKind('destination'); 

    } 
  // إغلاق البحث 
  setSearchText(''); };

  /* =========================================================
     Map press
  ========================================================= */

  const handleMapPress = (
    lngLat: LngLat
  ) => {
    // إذا عدّل المستخدم نقطة بعد وجود مسار،
    // نحذف المسار القديم لأنه لم يعد مطابقاً للنقطتين.
    if (routeGeoJson) {
      setRouteGeoJson(null);
    }

    const ok = setPoint(
      activeKind,
      lngLat
    );

    if (!ok) return;

    const other =
      activeKind === 'origin'
        ? destination
        : origin;

    if (other) {
      fitBoth(
        lngLat,
        other.lngLat
      );
    } else if (
      activeKind === 'origin'
    ) {
      // بعد الانطلاق ننتقل تلقائياً للوجهة
      setActiveKind('destination');
    }
  };

  /* =========================================================
     Locate Me
  ========================================================= */

  const handleLocate = async () => {
    // إذا كان هناك مسار قديم نحذفه
    if (routeGeoJson) {
      setRouteGeoJson(null);
    }

    const result =
      await locateMe();

    if (!result) return;

    if (destination) {
      fitBoth(
        result.lngLat,
        destination.lngLat
      );
    } else {
      setActiveKind('destination');

      cameraRef.current?.flyTo({
        center: result.lngLat,
        zoom: 16,
        duration: 800,
      });
    }
  };

  const showCard =
    origin !== null ||
    destination !== null;

  const cardSpace =
    showCard
      ? cardHeight + 12
      : 8;

  const searchQuery = searchText.trim().toLowerCase(); const searchResults = searchQuery ? SEARCH_DATA .filter((item) => { const name = item.name?.toLowerCase() ?? ''; const nameAr = item.nameAr?.toLowerCase() ?? ''; const nameEn = item.nameEn?.toLowerCase() ?? ''; return ( name.includes(searchQuery) || nameAr.includes(searchQuery) || nameEn.includes(searchQuery) ); }) .slice(0, 10) : [];
  /* =========================================================
     Loading screen
  ========================================================= */

  if (!offlineStyle) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Loading offline map...
        </Text>
      </View>
    );
  }

  /* =========================================================
     Main Screen
  ========================================================= */

  return (
    <View style={styles.container}>

      <Map
        style={styles.map}
        mapStyle={offlineStyle}
        logo={false}
        attribution={false}
        onPress={(event) =>
          handleMapPress(
            event.nativeEvent.lngLat as LngLat
          )
        }
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

        {/* =================================================
            Route
        ================================================= */}

        {routeGeoJson && (
          <GeoJSONSource
            id="trip-route"
            data={routeGeoJson}
          >

            {/* Walking */}
            {/* <Layer
              id="trip-route-walk"
              type="line"
              filter={[
                '==',
                ['get', 'edge_type'],
                'walk',
              ]}
              style={{
                lineColor: '#208AEF',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            /> */}

            {/* Transfer */}
            {/* <Layer
              id="trip-route-transfer"
              type="line"
              filter={[
                '==',
                ['get', 'edge_type'],
                'transfer',
              ]}
              style={{
                lineColor: '#888888',
                lineWidth: 4,
                lineDasharray: [2, 2],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            /> */}

            {/* Walking + Transfer */}
            <Layer
              id="trip-route-walk-transfer"
              type="line"
              filter={[
                'in',
                ['get', 'edge_type'],
                ['literal', ['walk', 'transfer']],
              ]}
              style={{
                lineColor: '#888888',
                lineWidth: 4,
                lineDasharray: [2, 2],
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />

            {/* Bus */}
            <Layer
              id="trip-route-bus"
              type="line"
              filter={[
                '==',
                ['get', 'edge_type'],
                'bus',
              ]}
              style={{
                lineColor: '#E5484D',
                lineWidth: 7,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />

          </GeoJSONSource>
        )}

        {/* =================================================
            Origin Marker
        ================================================= */}

        {origin && (
          <ViewAnnotation
            id="origin"
            lngLat={origin.lngLat}
            anchor="bottom"
            draggable
            onDragEnd={(event) => {
              setRouteGeoJson(null);

              setPoint(
                'origin',
                event.nativeEvent.lngLat as LngLat
              );
            }}
          >
            <Pin color={COLORS.origin} />
          </ViewAnnotation>
        )}

        {/* =================================================
            Destination Marker
        ================================================= */}

        {destination && (
          <ViewAnnotation
            id="destination"
            lngLat={destination.lngLat}
            anchor="bottom"
            draggable
            onDragEnd={(event) => {
              setRouteGeoJson(null);

              setPoint(
                'destination',
                event.nativeEvent.lngLat as LngLat
              );
            }}
          >
            <Pin color={COLORS.destination} />
          </ViewAnnotation>
        )}

      </Map>

      {/* ===================================================
    Search Bar
=================================================== */}

<View
  style={[
    styles.searchContainer,
    {
      top: insets.top + 12,
    },
  ]}
>
  <View style={styles.searchBar}>
    <Text style={styles.searchIcon}>
      🔍
    </Text>

    <TextInput
      value={searchText}
      onChangeText={setSearchText}
      placeholder={
        activeKind === 'origin'
          ? 'ابحث عن نقطة الانطلاق'
          : 'ابحث عن الوجهة'
      }
      placeholderTextColor="#888"
      style={styles.searchInput}
      textAlign="right"
      autoCorrect={false}
    />

    {searchText.length > 0 && (
      <Pressable
        onPress={() => setSearchText('')}
        style={styles.searchClear}
      >
        <Text style={styles.searchClearText}>
          ×
        </Text>
      </Pressable>
    )}
  </View>

  {searchQuery.length > 0 &&
    searchResults.length > 0 && (
      <View style={styles.searchResults}>
        {searchResults.map(
          (item, index) => (
            <Pressable
              key={`${item.longitude}-${item.latitude}-${index}`}
              style={styles.searchResult}
              onPress={() =>
                handleSearchSelect(item)
              }
            >
              <View style={styles.searchResultText}>
                <Text
                  style={styles.searchResultArabic}
                  numberOfLines={1}
                >
                  {item.nameAr ||
                    item.name ||
                    item.nameEn ||
                    'بدون اسم'}
                </Text>

                {item.nameEn &&
                  item.nameEn !== item.nameAr && (
                    <Text
                      style={styles.searchResultEnglish}
                      numberOfLines={1}
                    >
                      {item.nameEn}
                    </Text>
                  )}
              </View>
            </Pressable>
          )
        )}
        </View>
      )}

      {searchQuery.length > 0 &&
        searchResults.length === 0 && (
          <View style={styles.noSearchResults}>
            <Text style={styles.noSearchResultsText}>
              لا توجد نتائج
            </Text>
          </View>
        )}
    </View>
      {/* ===================================================
          Top Panel
      =================================================== */}

      <View
        style={[
          styles.topPanel,
          {
            top: insets.top + 70,
          },
        ]}
      >

        <View style={styles.chips}>

          {(
            ['origin', 'destination'] as const
          ).map((kind) => {

            const active =
              activeKind === kind;

            const isSet =
              kind === 'origin'
                ? origin !== null
                : destination !== null;

            return (
              <Pressable
                key={kind}
                style={[
                  styles.chip,
                  active && {
                    backgroundColor:
                      COLORS[kind],
                    borderColor:
                      COLORS[kind],
                  },
                ]}
                onPress={() =>
                  setActiveKind(kind)
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    active &&
                      styles.chipTextActive,
                  ]}
                >
                  {isSet ? '✓ ' : ''}
                  {LABELS[kind]}
                </Text>
              </Pressable>
            );
          })}

        </View>

        <Text style={styles.bannerText}>
          {error
            ? ERROR_MESSAGES[error]
            : HINTS[activeKind]}
        </Text>

        {error === 'blocked' && (
          <Pressable
            onPress={() =>
              Linking.openSettings()
            }
          >
            <Text style={styles.bannerLink}>
              فتح الإعدادات
            </Text>
          </Pressable>
        )}

      </View>

      {/* ===================================================
          GPS Button
      =================================================== */}

      <Pressable
        style={[
          styles.locateButton,
          {
            bottom:
              insets.bottom +
              16 +
              cardSpace,
          },
        ]}
        onPress={handleLocate}
        disabled={locating}
        accessibilityLabel="استخدم موقعي الحالي كنقطة انطلاق"
      >
        <Text style={styles.locateButtonText}>
          {locating
            ? '...'
            : '📍 موقعي'}
        </Text>
      </Pressable>

      {/* ===================================================
          Points Card
      =================================================== */}

      {showCard && (
        <View
          style={[
            styles.card,
            {
              bottom:
                insets.bottom + 16,
            },
          ]}
          onLayout={(e) =>
            setCardHeight(
              e.nativeEvent.layout.height
            )
          }
        >

          <PointRow
            kind="origin"
            point={origin}
            onClear={() => {
              setRouteGeoJson(null);
              clearPoint('origin');
              setActiveKind('origin');
            }}
          />

          <View style={styles.divider} />

          <PointRow
            kind="destination"
            point={destination}
            onClear={() => {
              setRouteGeoJson(null);
              clearPoint('destination');
              setActiveKind('destination');
            }}
          />

          {/* =================================================
              Calculate Route Button
          ================================================= */}

          {origin && destination && (
            <Pressable
              style={[
                styles.routeButton,
                loadingRoute &&
                  styles.routeButtonDisabled,
              ]}
              onPress={
                handleCalculateRoute
              }
              disabled={loadingRoute}
            >
              <Text
                style={
                  styles.routeButtonText
                }
              >
                {loadingRoute
                  ? 'جاري حساب المسار...'
                  : '🚌 احسب المسار'}
              </Text>
            </Pressable>
          )}

        </View>
      )}

    </View>
  );
}

/* =========================================================
   Point Row
========================================================= */

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

      <View
        style={[
          styles.rowDot,
          {
            backgroundColor:
              COLORS[kind],
          },
        ]}
      />

      <View style={styles.rowInfo}>

        <Text style={styles.rowTitle}>
          {LABELS[kind]}

          {point
            ? ` (${
                point.source === 'gps'
                  ? 'GPS'
                  : 'من الخريطة'
              })`
            : ''}
        </Text>

        {point ? (
          <Text style={styles.rowCoords}>
            {point.lngLat[1].toFixed(5)},{' '}
            {point.lngLat[0].toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.rowEmpty}>
            لم تُحدد بعد
          </Text>
        )}

        {point?.accuracy != null &&
          point.accuracy > 100 && (
            <Text
              style={styles.rowWarning}
            >
              دقة الموقع منخفضة
              (±
              {Math.round(
                point.accuracy
              )}
              م) — اسحب المؤشر لتصحيحه
            </Text>
          )}

      </View>

      {point && (
        <Pressable
          onPress={onClear}
          accessibilityLabel={`إلغاء ${LABELS[kind]}`}
        >
          <Text style={styles.clearText}>
            إلغاء
          </Text>
        </Pressable>
      )}

    </View>
  );
}

/* =========================================================
   Styles
========================================================= */

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },

  map: {
    flex: 1,
  },

  center: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    color: 'white',
  },

  /* =========================
     Top Panel
  ========================= */

  topPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor:
      'rgba(0,0,0,0.75)',
  },

  chips: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 10,
  },

  chip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor:
      'rgba(255,255,255,0.4)',
    alignItems: 'center',
  },

  chipText: {
    color:
      'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },

  chipTextActive: {
    color: 'white',
  },

  bannerText: {
    color: 'white',
    fontSize: 13,
    textAlign: 'right',
  },

  bannerLink: {
    color: '#7CC0FF',
    marginTop: 6,
    textAlign: 'right',
  },

  /* =========================
     Locate Button
  ========================= */

  locateButton: {
    position: 'absolute',
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#208AEF',
  },

  locateButtonText: {
    color: 'white',
    fontWeight: '600',
  },

  /* =========================
     Card
  ========================= */

  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'white',
  },

  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 10,
  },

  /* =========================
     Point Row
  ========================= */

  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },

  rowDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },

  rowInfo: {
    flex: 1,
  },

  rowTitle: {
    fontWeight: '600',
    textAlign: 'right',
  },

  rowCoords: {
    color: '#555',
    marginTop: 2,
    textAlign: 'right',
  },

  rowEmpty: {
    color: '#999',
    marginTop: 2,
    textAlign: 'right',
  },

  rowWarning: {
    color: '#B54B45',
    marginTop: 4,
    fontSize: 12,
    textAlign: 'right',
  },

  clearText: {
    color: '#B54B45',
    fontWeight: '600',
    paddingHorizontal: 8,
  },

  /* =========================
     Route Button
  ========================= */

  routeButton: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#208AEF',
    alignItems: 'center',
  },

  routeButtonDisabled: {
    opacity: 0.6,
  },

  routeButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  /* ========================= Search Bar ========================= */ searchContainer: { position: 'absolute', left: 12, right: 12, zIndex: 20, }, searchBar: { height: 50, backgroundColor: 'white', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2, }, elevation: 5, }, searchIcon: { fontSize: 20, marginLeft: 8, }, searchInput: { flex: 1, height: 50, color: '#222', fontSize: 15, paddingHorizontal: 8, }, searchClear: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', }, searchClearText: { fontSize: 24, color: '#777', lineHeight: 26, }, searchResults: { marginTop: 6, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2, }, elevation: 5, }, searchResult: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#EEEEEE', }, searchResultText: { flex: 1, }, searchResultArabic: { color: '#222', fontSize: 14, fontWeight: '600', textAlign: 'right', }, searchResultEnglish: { color: '#777', fontSize: 12, marginTop: 3, textAlign: 'right', }, noSearchResults: { marginTop: 6, backgroundColor: 'white', borderRadius: 12, padding: 15, }, noSearchResultsText: { color: '#777', textAlign: 'right', fontSize: 14, },

});
