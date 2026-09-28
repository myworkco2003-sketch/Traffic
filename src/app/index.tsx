import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Map, Camera } from '@maplibre/maplibre-react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import mapStyleJson from '../../assets/assets/style.json';

export default function Index() {
  const [offlineStyle, setOfflineStyle] = useState<any>(null);

  useEffect(() => {
    async function setupOfflineMap() {
      try {
        
        // 1. تحميل ملف MBTiles المحلي
        const mbtilesAsset = Asset.fromModule(
          require('../../assets/assets/damascus.mbtiles')
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
                '../../assets/assets/fonts/Noto Sans Bold/0-255.pbf'
              )
            ),
            fileName: '0-255.pbf',
          },
          {
            asset: Asset.fromModule(
              require(
                '../../assets/assets/fonts/Noto Sans Bold/1536-1791.pbf'
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

  // الخريطة
  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={offlineStyle}
        logo={false}
        attribution={false}
      >
        <Camera
          zoomLevel={13}
          centerCoordinate={[36.2913, 33.5138]}
          animationMode="none"
        />
      </Map>
    </View>
  );
}

// تنسيقات الشاشة
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
});