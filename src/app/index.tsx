
import {
  Camera,
  Map,
  ViewAnnotation,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import searchIndex from "../../assets/search-index.json";
import mapStyleJson from "../../assets/style.json";
import { Pin } from "../components/Pin";
import {
  MAP_BOUNDS,
  useTrip,
  type LngLat,
  type PointKind,
  type TripPoint,
} from "../state/TripContext";

const DAMASCUS_CENTER: LngLat = [36.2913, 33.5138];

const COLORS: Record<PointKind, string> = {
  origin: "#2E9B70",
  destination: "#E5484D",
};

const LABELS: Record<PointKind, string> = {
  origin: "نقطة الانطلاق",
  destination: "الوجهة",
};

const HINTS: Record<PointKind, string> = {
  origin:
    "اضغط على الخريطة لتحديد نقطة الانطلاق، أو استخدم موقعك",
  destination: "اضغط على الخريطة لتحديد الوجهة",
};

const ERROR_MESSAGES = {
  denied:
    "لم يتم منح إذن الموقع. يمكنك تحديد نقطتك بالضغط على الخريطة.",
  blocked:
    "إذن الموقع مرفوض. فعّله من إعدادات الجهاز أو حدّد نقطتك على الخريطة.",
  unavailable:
    "تعذّر تحديد موقعك. تأكد من تشغيل GPS أو حدّد نقطتك على الخريطة.",
  outside: "هذا الموقع خارج نطاق خريطة دمشق المتاحة.",
} as const;

type SearchItem = {
  name: string;
  nameAr?: string;
  nameEn?: string;
  kind: string;
  longitude: number;
  latitude: number;
};

const SEARCH_DATA = searchIndex as SearchItem[];

export default function Index() {
  const [offlineStyle, setOfflineStyle] =
    useState<any>(null);

  const {
    origin,
    destination,
    locating,
    error,
    setPoint,
    locateMe,
    clearPoint,
  } = useTrip();

  const [activeKind, setActiveKind] =
    useState<PointKind>("origin");

  const [cardHeight, setCardHeight] = useState(0);

  const [searchText, setSearchText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();

  // =========================================================
  // تحميل الخريطة والـ MBTiles
  // =========================================================

  useEffect(() => {
    async function setupOfflineMap() {
      try {
        // 1. تحميل ملف MBTiles المحلي
        const mbtilesAsset = Asset.fromModule(
          require("../../assets/damascus.mbtiles"),
        );

        await mbtilesAsset.downloadAsync();

        const dbPath =
          mbtilesAsset.localUri?.replace("file://", "");

        if (!dbPath) {
          throw new Error(
            "MBTiles database path was not found.",
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

        // 3. تحميل ملفات Glyphs المحلية
        const glyphFiles = [
          {
            asset: Asset.fromModule(
              require(
                "../../assets/fonts/Noto Sans Bold/0-255.pbf",
              ),
            ),
            fileName: "0-255.pbf",
          },
          {
            asset: Asset.fromModule(
              require(
                "../../assets/fonts/Noto Sans Bold/1536-1791.pbf",
              ),
            ),
            fileName: "1536-1791.pbf",
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
          JSON.stringify(mapStyleJson),
        );

        // =====================================================
        // 5. تعديل طبقات الخريطة
        // =====================================================

        dynamicStyle.layers =
          dynamicStyle.layers.map((layer: any) => {
            // -------------------------------------------------
            // استخدام Noto Sans Bold
            // -------------------------------------------------

            if (
              layer.type === "symbol" &&
              layer.layout?.["text-font"]
            ) {
              layer.layout["text-font"] =
                ["Noto Sans Bold"];
            }

            // -------------------------------------------------
            // عرض أسماء الأماكن:
            // Arabic → name → English
            // -------------------------------------------------

            if (
              layer.type === "symbol" &&
              layer.layout?.["text-field"]
            ) {
              const textField = JSON.stringify(
                layer.layout["text-field"],
              );

              const isNameLayer =
                textField.includes("name:en") ||
                textField.includes('"name"');

              if (isNameLayer) {
                layer.layout["text-field"] = [
                  "coalesce",
                  ["get", "name:ar"],
                  ["get", "name"],
                  ["get", "name:en"],
                ];
              }
            }

            // -------------------------------------------------
            // إصلاح Invalid geometry in line layer
            // -------------------------------------------------

            if (
              layer.type === "line" &&
              !layer.filter
            ) {
              layer.filter = [
                "!=",
                "$type",
                "Point",
              ];
            }

            return layer;
          });

        // 6. استخدام MBTiles المحلي
        dynamicStyle.sources.openmaptiles.url =
          `mbtiles://${dbPath}`;

        // 7. الحد الأقصى للـ Zoom
        dynamicStyle.sources.openmaptiles.maxzoom = 14;

        // 8. استخدام Glyphs
        dynamicStyle.glyphs = mapStyleJson.glyphs;

        // 9. حفظ الـ Style
        setOfflineStyle(dynamicStyle);
      } catch (error) {
        console.error(
          "Failed to load offline map assets:",
          error,
        );
      }
    }

    setupOfflineMap();
  }, []);

  // =========================================================
  // شاشة التحميل
  // =========================================================

  if (!offlineStyle) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>
          Loading offline map...
        </Text>
      </View>
    );
  }

  // =========================================================
  // تكبير الخريطة لإظهار النقطتين
  // =========================================================

  const fitBoth = (
    a: LngLat,
    b: LngLat,
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
      },
    );
  };

  // =========================================================
  // الضغط على الخريطة
  // =========================================================

  const handleMapPress = (
    lngLat: LngLat,
  ) => {
    const ok = setPoint(
      activeKind,
      lngLat,
    );

    if (!ok) return;

    const other =
      activeKind === "origin"
        ? destination
        : origin;

    if (other) {
      fitBoth(
        lngLat,
        other.lngLat,
      );
    } else if (
      activeKind === "origin"
    ) {
      setActiveKind("destination");
    }
  };

  // =========================================================
  // استخدام الموقع الحالي
  // =========================================================

  const handleLocate = async () => {
    const result = await locateMe();

    if (!result) return;

    if (destination) {
      fitBoth(
        result.lngLat,
        destination.lngLat,
      );
    } else {
      setActiveKind("destination");

      cameraRef.current?.flyTo({
        center: result.lngLat,
        zoom: 16,
        duration: 800,
      });
    }
  };

  // =========================================================
  // البحث
  // =========================================================

  const showCard =
    origin !== null ||
    destination !== null;

  const cardSpace =
    showCard
      ? cardHeight + 12
      : 8;

  const query =
    searchText
      .trim()
      .toLowerCase();

  const searchResults = query
    ? SEARCH_DATA
        .filter((item) => {
          const name =
            item.name
              ?.toLowerCase() ?? "";

          const nameAr =
            item.nameAr
              ?.toLowerCase() ?? "";

          const nameEn =
            item.nameEn
              ?.toLowerCase() ?? "";

          return (
            name.includes(query) ||
            nameAr.includes(query) ||
            nameEn.includes(query)
          );
        })
        .slice(0, 10)
    : [];

  // =========================================================
  // اختيار نتيجة البحث
  // =========================================================

  const handleSearchSelect = (
    item: SearchItem,
  ) => {
    const lngLat: LngLat = [
      item.longitude,
      item.latitude,
    ];

    const ok = setPoint(
      activeKind,
      lngLat,
    );

    if (!ok) {
      return;
    }

    setSearchText(
      item.nameAr ||
        item.name ||
        item.nameEn ||
        "",
    );

    setSearchOpen(false);

    const other =
      activeKind === "origin"
        ? destination
        : origin;

    if (other) {
      fitBoth(
        lngLat,
        other.lngLat,
      );
    } else {
      cameraRef.current?.flyTo({
        center: lngLat,
        zoom: 16,
        duration: 800,
      });
    }

    // الانتقال تلقائياً للوجهة
    if (
      activeKind === "origin"
    ) {
      setActiveKind(
        "destination",
      );
    }
  };

  // =========================================================
  // UI
  // =========================================================

  return (
    <View style={styles.container}>
      {/* ===================================================
          الخريطة
         =================================================== */}

      <Map
        style={styles.map}
        mapStyle={offlineStyle}
        logo={false}
        attribution={false}
        onPress={(event) =>
          handleMapPress(
            event.nativeEvent
              .lngLat as LngLat,
          )
        }
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: DAMASCUS_CENTER,
            zoom: 13,
          }}
          minZoom={6}
          maxBounds={MAP_BOUNDS}
        />

        {/* نقطة الانطلاق */}

        {origin && (
          <ViewAnnotation
            id="origin"
            lngLat={origin.lngLat}
            anchor="bottom"
            draggable
            onDragEnd={(event) =>
              setPoint(
                "origin",
                event.nativeEvent
                  .lngLat as LngLat,
              )
            }
          >
            <Pin
              color={
                COLORS.origin
              }
            />
          </ViewAnnotation>
        )}

        {/* الوجهة */}

        {destination && (
          <ViewAnnotation
            id="destination"
            lngLat={
              destination.lngLat
            }
            anchor="bottom"
            draggable
            onDragEnd={(event) =>
              setPoint(
                "destination",
                event.nativeEvent
                  .lngLat as LngLat,
              )
            }
          >
            <Pin
              color={
                COLORS.destination
              }
            />
          </ViewAnnotation>
        )}
      </Map>

      {/* ===================================================
          اللوحة العلوية
         =================================================== */}

      <View
        style={[
          styles.topPanel,
          {
            top:
              insets.top + 10,
          },
        ]}
      >
        {/* البحث */}

        <View
          style={
            styles.searchContainer
          }
        >
          <Text
            style={
              styles.searchIcon
            }
          >
            ⌕
          </Text>

          <TextInput
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              setSearchOpen(true);
            }}
            onFocus={() => {
              setSearchOpen(true);
            }}
            placeholder={
              activeKind === "origin"
                ? "ابحث عن نقطة الانطلاق"
                : "ابحث عن الوجهة"
            }
            placeholderTextColor="#8A8A8A"
            style={
              styles.searchInput
            }
            returnKeyType="search"
          />

          {searchText.length >
            0 && (
            <Pressable
              style={
                styles.clearSearchButton
              }
              onPress={() => {
                setSearchText("");
                setSearchOpen(false);
              }}
            >
              <Text
                style={
                  styles.clearSearchText
                }
              >
                ×
              </Text>
            </Pressable>
          )}
        </View>

        {/* نتائج البحث */}

        {searchOpen &&
          searchResults.length >
            0 && (
            <View
              style={
                styles.searchResults
              }
            >
              {searchResults.map(
                (
                  item,
                  index,
                ) => (
                  <Pressable
                    key={`${item.name}-${item.longitude}-${item.latitude}-${index}`}
                    onPress={() => {
                      handleSearchSelect(
                        item,
                      );
                    }}
                    style={[
                      styles.searchResult,
                      index ===
                        searchResults.length -
                          1 &&
                        styles.searchResultLast,
                    ]}
                  >
                    <View
                      style={
                        styles.resultIcon
                      }
                    >
                      <Text
                        style={
                          styles.resultIconText
                        }
                      >
                        ●
                      </Text>
                    </View>

                    <View
                      style={
                        styles.resultInfo
                      }
                    >
                      <Text
                        style={
                          styles.resultName
                        }
                      >
                        {item.nameAr ||
                          item.name}
                      </Text>

                      {item.nameEn &&
                        item.nameEn !==
                          item.nameAr && (
                          <Text
                            style={
                              styles.resultNameEn
                            }
                          >
                            {
                              item.nameEn
                            }
                          </Text>
                        )}
                    </View>
                  </Pressable>
                ),
              )}
            </View>
          )}

        {/* اختيار الانطلاق والوجهة */}

        <View
          style={
            styles.pointSelector
          }
        >
          {(
            [
              "origin",
              "destination",
            ] as const
          ).map((kind) => {
            const active =
              activeKind ===
              kind;

            const isSet =
              kind === "origin"
                ? origin !== null
                : destination !==
                  null;

            return (
              <Pressable
                key={kind}
                style={[
                  styles.pointButton,
                  active && {
                    backgroundColor:
                      COLORS[kind],
                    borderColor:
                      COLORS[kind],
                  },
                ]}
                onPress={() => {
                  setActiveKind(
                    kind,
                  );
                  setSearchOpen(
                    false,
                  );
                }}
              >
                <View
                  style={[
                    styles.pointDot,
                    {
                      backgroundColor:
                        active
                          ? "#FFFFFF"
                          : COLORS[kind],
                    },
                  ]}
                />

                <Text
                  style={[
                    styles.pointButtonText,
                    active &&
                      styles.pointButtonTextActive,
                  ]}
                >
                  {LABELS[kind]}
                </Text>

                {isSet && (
                  <Text
                    style={[
                      styles.pointCheck,
                      active &&
                        styles.pointCheckActive,
                    ]}
                  >
                    ✓
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* رسالة الحالة */}

        <View
          style={
            styles.hintContainer
          }
        >
          <Text
            style={
              styles.hintIcon
            }
          >
            {error ? "!" : "i"}
          </Text>

          <Text
            style={
              styles.bannerText
            }
          >
            {error
              ? ERROR_MESSAGES[
                  error
                ]
              : HINTS[
                  activeKind
                ]}
          </Text>
        </View>

        {/* فتح الإعدادات */}

        {error === "blocked" && (
          <Pressable
            style={
              styles.settingsButton
            }
            onPress={() =>
              Linking.openSettings()
            }
          >
            <Text
              style={
                styles.bannerLink
              }
            >
              فتح الإعدادات
            </Text>
          </Pressable>
        )}
      </View>

      {/* ===================================================
          زر موقعي
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
        onPress={
          handleLocate
        }
        disabled={locating}
        accessibilityLabel="استخدم موقعي الحالي كنقطة انطلاق"
      >
        <Text
          style={
            styles.locateIcon
          }
        >
          ⌖
        </Text>

        <Text
          style={
            styles.locateButtonText
          }
        >
          {locating
            ? "..."
            : "موقعي"}
        </Text>
      </Pressable>

      {/* ===================================================
          بطاقة نقاط الرحلة
         =================================================== */}

      {showCard && (
        <View
          style={[
            styles.card,
            {
              bottom:
                insets.bottom +
                16,
            },
          ]}
          onLayout={(e) =>
            setCardHeight(
              e.nativeEvent
                .layout.height,
            )
          }
        >
          <PointRow
            kind="origin"
            point={origin}
            onClear={() => {
              clearPoint(
                "origin",
              );
              setActiveKind(
                "origin",
              );
            }}
          />

          <View
            style={
              styles.divider
            }
          />

          <PointRow
            kind="destination"
            point={
              destination
            }
            onClear={() => {
              clearPoint(
                "destination",
              );
              setActiveKind(
                "destination",
              );
            }}
          />
        </View>
      )}
    </View>
  );
}

// ===========================================================
// Point Row
// ===========================================================

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

      <View
        style={
          styles.rowInfo
        }
      >
        <Text
          style={
            styles.rowTitle
          }
        >
          {LABELS[kind]}
        </Text>

        {point ? (
          <>
            <Text
              style={
                styles.rowCoords
              }
            >
              {point.source ===
              "gps"
                ? "📍 الموقع الحالي"
                : `${point.lngLat[1].toFixed(
                    5,
                  )}, ${point.lngLat[0].toFixed(
                    5,
                  )}`}
            </Text>

            {point.accuracy !=
              null &&
              point.accuracy >
                100 && (
                <Text
                  style={
                    styles.rowWarning
                  }
                >
                  دقة الموقع منخفضة
                  {" "}
                  (±
                  {Math.round(
                    point.accuracy,
                  )}{" "}
                  م)
                </Text>
              )}
          </>
        ) : (
          <Text
            style={
              styles.rowEmpty
            }
          >
            لم تُحدد بعد
          </Text>
        )}
      </View>

      {point && (
        <Pressable
          style={
            styles.clearButton
          }
          onPress={
            onClear
          }
          accessibilityLabel={`إلغاء ${LABELS[kind]}`}
        >
          <Text
            style={
              styles.clearText
            }
          >
            إلغاء
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ===========================================================
// Styles
// ===========================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EDEDED",
  },

  map: {
    flex: 1,
  },

  center: {
    flex: 1,
    backgroundColor: "#F5F6F7",
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    color: "#333",
    fontSize: 15,
  },

  // =========================================================
  // Top Panel
  // =========================================================

  topPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 100,
  },

  // =========================================================
  // Search
  // =========================================================

  searchContainer: {
    height: 54,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 14,

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },

  searchIcon: {
    fontSize: 25,
    color: "#555",
    marginLeft: 8,
  },

  searchInput: {
    flex: 1,
    height: 54,
    fontSize: 16,
    color: "#111",
    textAlign: "right",
    paddingHorizontal: 8,
  },

  clearSearchButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EEEEEE",
    justifyContent: "center",
    alignItems: "center",
  },

  clearSearchText: {
    color: "#666",
    fontSize: 21,
    lineHeight: 23,
  },

  // =========================================================
  // Search Results
  // =========================================================

  searchResults: {
    marginTop: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },

  searchResult: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },

  searchResultLast: {
    borderBottomWidth: 0,
  },

  resultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F0F4F2",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },

  resultIconText: {
    color: "#2E9B70",
    fontSize: 12,
  },

  resultInfo: {
    flex: 1,
  },

  resultName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
    textAlign: "right",
  },

  resultNameEn: {
    marginTop: 3,
    fontSize: 12,
    color: "#888",
    textAlign: "right",
  },

  // =========================================================
  // Origin / Destination
  // =========================================================

  pointSelector: {
    flexDirection: "row-reverse",
    gap: 8,
    marginTop: 10,
  },

  pointButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    backgroundColor:
      "rgba(255,255,255,0.96)",

    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },

  pointDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: 7,
  },

  pointButtonText: {
    color: "#333",
    fontSize: 13,
    fontWeight: "600",
  },

  pointButtonTextActive: {
    color: "#FFFFFF",
  },

  pointCheck: {
    marginRight: 6,
    color: "#2E9B70",
    fontSize: 15,
    fontWeight: "700",
  },

  pointCheckActive: {
    color: "#FFFFFF",
  },

  // =========================================================
  // Hint
  // =========================================================

  hintContainer: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor:
      "rgba(255,255,255,0.92)",

    flexDirection: "row-reverse",
    alignItems: "center",
  },

  hintIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E9EEF5",
    color: "#4D6680",
    textAlign: "center",
    lineHeight: 20,
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 8,
  },

  bannerText: {
    flex: 1,
    color: "#555",
    fontSize: 12,
    textAlign: "right",
    lineHeight: 18,
  },

  settingsButton: {
    alignSelf: "flex-end",
    marginTop: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  bannerLink: {
    color: "#208AEF",
    fontSize: 12,
    fontWeight: "600",
  },

  // =========================================================
  // Locate Button
  // =========================================================

  locateButton: {
    position: "absolute",
    right: 16,
    minWidth: 104,
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",

    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 6,
  },

  locateIcon: {
    fontSize: 21,
    color: "#208AEF",
    marginLeft: 7,
  },

  locateButtonText: {
    color: "#222",
    fontSize: 14,
    fontWeight: "700",
  },

  // =========================================================
  // Bottom Card
  // =========================================================

  card: {
    position: "absolute",
    left: 12,
    right: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },

  divider: {
    height: 1,
    backgroundColor: "#EEEEEE",
    marginVertical: 11,
    marginLeft: 22,
  },

  row: {
    minHeight: 52,
    flexDirection: "row-reverse",
    alignItems: "center",
  },

  rowDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    marginLeft: 12,
  },

  rowInfo: {
    flex: 1,
  },

  rowTitle: {
    color: "#222",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },

  rowCoords: {
    color: "#777",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },

  rowEmpty: {
    color: "#AAAAAA",
    fontSize: 12,
    marginTop: 4,
    textAlign: "right",
  },

  rowWarning: {
    color: "#B54B45",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },

  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginRight: 8,
  },

  clearText: {
    color: "#C44747",
    fontSize: 12,
    fontWeight: "700",
  },
});
