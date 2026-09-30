import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
  type CameraRef,
} from "@maplibre/maplibre-react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { TripDetailsSheet } from "../components/TripDetailsSheet";
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
  origin: "اضغط على الخريطة لتحديد نقطة الانطلاق، أو استخدم موقعك",
  destination: "اضغط على الخريطة لتحديد الوجهة",
};

const ERROR_MESSAGES = {
  denied: "لم يتم منح إذن الموقع. يمكنك تحديد نقطتك بالضغط على الخريطة.",
  blocked:
    "إذن الموقع مرفوض. فعّله من إعدادات الجهاز أو حدّد نقطتك على الخريطة.",
  unavailable:
    "تعذّر تحديد موقعك. تأكد من تشغيل GPS أو حدّد نقطتك على الخريطة.",
  outside: "هذا الموقع خارج نطاق خريطة دمشق المتاحة.",
} as const;

type SearchItem = {
  name?: string;
  nameAr?: string;
  nameEn?: string;
  kind?: string;
  longitude: number;
  latitude: number;
};
const SEARCH_DATA = searchIndex as SearchItem[];

/* =========================================================
   Route types
========================================================= */

type RouteStep = {
  step_order: number;
  edge_type: "walk" | "transfer" | "bus";
  route_name: string;
  duration_minutes: number;
  waiting_minutes?: number;
  geojson: string;
};

type RouteResponse = {
  steps: RouteStep[];
};

/* =========================================================
   Temporary Mock Backend Response

   لاحقاً سيتم استبدال هذا الجزء بالـ API الحقيقي.
========================================================= */

// const MOCK_ROUTE_RESPONSE: RouteResponse = {
//   steps: [
//     {
//       step_order: 1,
//       edge_type: "walk",
//       route_name: "Walking Path",
//       duration_minutes: 1.0,
//       geojson:
//         '{"type":"LineString","coordinates":[[36.2892282,33.5135877],[36.2891276,33.5136801],[36.2891068,33.5136974],[36.2890816,33.5137103],[36.289049,33.5137188],[36.2890692,33.5137431],[36.2890944,33.513764],[36.2891193,33.5137786],[36.2891467,33.5137897],[36.2893103,33.5138456],[36.2893586,33.5138557],[36.2894179,33.5138626],[36.2894248,33.5138327],[36.2894333,33.5138132],[36.289449,33.5137975],[36.2894671,33.5137867],[36.2894203,33.5137293],[36.289368,33.5136779]]}',
//     },
//     {
//       step_order: 2,
//       edge_type: "transfer",
//       route_name: "Walk/Wait Transfer",
//       duration_minutes: 2.0,
//       geojson:
//         '{"type":"LineString","coordinates":[[36.289228,33.513588],[36.2892282,33.5135877]]}',
//     },
//     {
//       step_order: 3,
//       edge_type: "bus",
//       route_name: "Jisr Alhuryah - Dahiyat Qudsaiya Gharbiah",
//       duration_minutes: 4.0,
//       geojson:
//         '{"type":"LineString","coordinates":[[36.289228,33.513588],[36.288959,33.513581],[36.2886875,33.513573],[36.288416,33.513565],[36.28797625,33.513552752],[36.2875365,33.513540503],[36.28709675,33.513528252],[36.286657,33.513516],[36.286219,33.513498501],[36.285781,33.513481],[36.28527975,33.513462503],[36.2847785,33.513444004],[36.28427725,33.513425503],[36.283776,33.513407],[36.28326575,33.513389753],[36.2827555,33.513372504],[36.28224525,33.513355253],[36.281735,33.513338],[36.2813645,33.513320501],[36.280994,33.513303],[36.2807095,33.51329],[36.280425,33.513277],[36.280018,33.513277],[36.279653,33.513285],[36.279288,33.513321],[36.279019,33.513374],[36.278574,33.513417],[36.278562,33.513419],[36.278277501,33.513479251],[36.277993001,33.513539501],[36.277708501,33.513599751],[36.277424,33.51366],[36.2771115,33.5137275],[36.276799,33.513795],[36.276277501,33.513884001],[36.275756,33.513973],[36.275443751,33.514038251],[36.275131501,33.514103502]]}',
//     },
//     {
//       step_order: 4,
//       edge_type: "transfer",
//       route_name: "Walk/Wait Transfer",
//       duration_minutes: 2.1,
//       geojson:
//         '{"type":"LineString","coordinates":[[36.275131501,33.514103502],[36.275148,33.5140154]]}',
//     },
//     {
//       step_order: 5,
//       edge_type: "walk",
//       route_name: "Walking Path",
//       duration_minutes: 1.2,
//       geojson:
//         '{"type":"LineString","coordinates":[[36.275148,33.5140154],[36.2751015,33.5139366],[36.2750985,33.5138478],[36.2751076,33.5136726],[36.275135,33.5134899],[36.2752149,33.5132967],[36.2753439,33.5132191]]}',
//     },
//   ],
// };

const MOCK_ROUTE_RESPONSE: RouteResponse = {
  steps: [
    {
      step_order: 1,
      edge_type: "walk",
      route_name: "Walking Path",
      duration_minutes: 1.3,
      geojson:
        '{"type":"LineString","coordinates":[[36.3020793,33.539297],[36.3019316,33.5394427],[36.3019034,33.5394706],[36.3018853,33.5394884],[36.3017613,33.5397241],[36.3016396,33.5398833],[36.3014975,33.5400893],[36.3015144,33.5401034]]}',
    },
    {
      step_order: 2,
      edge_type: "transfer",
      route_name: "Walk/Wait Transfer",
      duration_minutes: 2.0,
      geojson:
        '{"type":"LineString","coordinates":[[36.302079,33.539297],[36.3020793,33.539297]]}',
    },
    {
      step_order: 3,
      edge_type: "bus",
      route_name: "Dawar Alshamali",
      duration_minutes: 22.3,
      geojson:
        '{"type":"LineString","coordinates":[[36.302079,33.539297],[36.301711499,33.539006501],[36.301344,33.538716],[36.300979999,33.538423001],[36.300616,33.53813],[36.300319499,33.537891],[36.300023,33.537652],[36.299760498,33.537439251],[36.299497997,33.537226501],[36.299235498,33.537013751],[36.298973,33.536801],[36.298762,33.536628],[36.298551,33.536455],[36.298350249,33.53630425],[36.298149499,33.536153501],[36.297948749,33.53600275],[36.297748,33.535852],[36.297533249,33.535685001],[36.297318498,33.535518001],[36.297103749,33.535351001],[36.296889,33.535184],[36.296553999,33.5350125],[36.296219,33.534841],[36.295967,33.534766],[36.295595,33.534680001],[36.295223,33.534594],[36.294805,33.534592],[36.294556,33.53455],[36.294523,33.534537],[36.294366,33.534478],[36.294256,33.534404],[36.294214,33.534349],[36.294188,33.534286],[36.294178,33.534212],[36.294167,33.5338],[36.294171,33.533749],[36.294127,33.533691],[36.294113,33.533627],[36.2941,33.5333555],[36.294087,33.533084],[36.294074,33.5328125],[36.294061,33.532541],[36.294025,33.5321515],[36.293989,33.531762],[36.293956,33.5314025],[36.293923,33.531043],[36.293901,33.53080425],[36.293879,33.5305655],[36.293857,33.53032675],[36.293835,33.530088],[36.293768,33.529767],[36.293739,33.529559],[36.29372,33.529488],[36.293669,33.529417],[36.293628,33.529374],[36.293556,33.529342],[36.293503,33.529292],[36.293467,33.529227],[36.293457,33.528892],[36.293423,33.528511],[36.293349,33.528483],[36.293126497,33.528315876],[36.292903995,33.528148752],[36.292681494,33.527981628],[36.292458993,33.527814503],[36.292236494,33.527647378],[36.292013995,33.527480252],[36.291791497,33.527313126],[36.291569,33.527146],[36.291526,33.527116],[36.291151,33.526856],[36.290914,33.526685],[36.290755,33.526505],[36.290699,33.52648],[36.290656,33.526442],[36.29063,33.526394],[36.290624,33.526342],[36.290638,33.52629],[36.290567,33.526189],[36.290441,33.526073],[36.290283,33.525928],[36.290191,33.525871],[36.289796,33.525627],[36.289369,33.525362],[36.289321,33.525333],[36.289005499,33.5251375],[36.28869,33.524942],[36.28846,33.524802],[36.288384,33.524755],[36.288318,33.524715],[36.288068,33.524614],[36.287998,33.524585],[36.287903,33.524547],[36.28769,33.524682],[36.287543,33.524777],[36.287307251,33.524923251],[36.287071502,33.525069501],[36.286835751,33.525215751],[36.2866,33.525362],[36.286175,33.525619],[36.286103,33.525663],[36.285799,33.525853],[36.28546,33.526058],[36.285307,33.52614],[36.284995,33.526106],[36.284889,33.52608],[36.284787,33.526047],[36.284689,33.526006],[36.284596,33.525957],[36.284291499,33.525703],[36.283987,33.525449],[36.28371,33.525219],[36.283295,33.525292],[36.283218,33.525289],[36.283176,33.525275],[36.283139,33.525253],[36.282870998,33.525056251],[36.282602998,33.524859501],[36.282334998,33.524662751],[36.282067,33.524466],[36.281755,33.524451],[36.281678,33.524453],[36.281513,33.524442],[36.281334,33.524422],[36.281181,33.5244],[36.281029,33.524372],[36.28086,33.524333],[36.280694,33.524287],[36.280424499,33.524206001],[36.280154999,33.524125001],[36.279885499,33.524044001],[36.279616,33.523963],[36.279304,33.5238555],[36.278992,33.523748],[36.278596,33.523635],[36.278272,33.52354],[36.277948,33.523445],[36.277614,33.523348],[36.277345499,33.523262001],[36.277076999,33.523176001],[36.276808499,33.523090001],[36.27654,33.523004],[36.276201,33.5228965],[36.275862,33.522789],[36.275727,33.522754],[36.275598,33.522739],[36.2751855,33.522713001],[36.274773,33.522687],[36.274241,33.522658],[36.274152,33.522654],[36.273731,33.5226],[36.273298999,33.522460001],[36.272867,33.52232],[36.272531,33.522239],[36.272254,33.52219],[36.271941,33.5221535],[36.271628,33.522117],[36.271448,33.522096],[36.271103,33.522088],[36.271101,33.522088],[36.27081225,33.522094127],[36.2705235,33.522100254],[36.27023475,33.52210638],[36.269946,33.522112505],[36.26965725,33.52211863],[36.2693685,33.522124754],[36.26907975,33.522130877],[36.268791,33.522137],[36.26859,33.522126],[36.268422,33.522118],[36.268066,33.522119001],[36.26771,33.52212],[36.2673775,33.522134],[36.267045,33.522148],[36.266904,33.522056],[36.266828,33.52199],[36.266798,33.521913],[36.266776,33.521838],[36.266773,33.521824],[36.266765,33.521733],[36.266782,33.521624],[36.266897,33.52149],[36.266997,33.52133],[36.267072,33.521161],[36.267123,33.520986],[36.267148,33.520807],[36.267146,33.520626],[36.267118,33.520447],[36.267116,33.520349],[36.267116,33.520315],[36.267123,33.520245],[36.267145,33.520155],[36.267232,33.519992],[36.267281,33.519921],[36.267353,33.519866],[36.267443,33.519833],[36.267541,33.519826],[36.267564,33.519828],[36.267662,33.519797],[36.267811,33.519733],[36.268054,33.519605],[36.268399001,33.519374],[36.268744,33.519143],[36.269007,33.518967],[36.269122,33.518889],[36.269536504,33.518610002],[36.269951005,33.518331003],[36.270365504,33.518052002],[36.27078,33.517773],[36.271118,33.517546],[36.271374502,33.517372501],[36.271631002,33.517199001],[36.271887502,33.517025501],[36.272144,33.516852],[36.272554254,33.516575502],[36.272964505,33.516299003],[36.273374754,33.516022502],[36.273785,33.515746],[36.274081,33.515384],[36.274410002,33.515166751],[36.274739003,33.514949502],[36.275068002,33.514732251],[36.275397,33.514515],[36.275738,33.514291],[36.275997,33.514118],[36.276018,33.514105],[36.275967,33.514023],[36.275917,33.513847],[36.275966,33.513593],[36.275654999,33.513406],[36.275344,33.513219],[36.2752,33.513133],[36.27499,33.513006],[36.274749,33.5128615],[36.274508,33.512717],[36.274190999,33.512532],[36.273874,33.512347],[36.273623,33.512143],[36.273316499,33.5119505],[36.27301,33.511758],[36.272685499,33.5115675],[36.272361,33.511377],[36.272317,33.511351],[36.271928,33.511131],[36.271580999,33.5109345],[36.271234,33.510738],[36.271105,33.510673],[36.270756,33.5105],[36.270427999,33.5103025],[36.2701,33.510105],[36.269721,33.509906],[36.269462,33.509754],[36.269203,33.509602],[36.268931621,33.509442502],[36.268660244,33.509283004],[36.268388867,33.509123504],[36.268117492,33.508964005],[36.267846117,33.508804504],[36.267574744,33.508645004],[36.267303371,33.508485502],[36.267032,33.508326],[36.266706,33.508134],[36.26639,33.507948],[36.266078,33.507901],[36.2657955,33.507903],[36.265513,33.507905],[36.264998,33.507887001],[36.264483,33.507869],[36.264426,33.507878],[36.26432,33.507918],[36.264273,33.507948],[36.264233,33.507984],[36.264161,33.508017],[36.264045,33.508363],[36.263928,33.508667],[36.263800501,33.5090255],[36.263673,33.509384],[36.263543252,33.50975625],[36.263413502,33.5101285],[36.263283752,33.51050075]]}',
    },
    {
      step_order: 4,
      edge_type: "transfer",
      route_name: "Walk/Wait Transfer",
      duration_minutes: 2.6,
      geojson:
        '{"type":"LineString","coordinates":[[36.263283752,33.51050075],[36.2628592,33.5107492]]}',
    },
    {
      step_order: 5,
      edge_type: "walk",
      route_name: "Walking Path",
      duration_minutes: 9.7,
      geojson:
        '{"type":"LineString","coordinates":[[36.2628592,33.5107492],[36.2627077,33.5108541],[36.2626291,33.5109055],[36.2625146,33.5109454],[36.2623278,33.5109685],[36.2617213,33.5107719],[36.2610641,33.5105373],[36.2604784,33.5103143],[36.260276,33.5102522],[36.2601587,33.5102108],[36.260065,33.5101699],[36.2599607,33.5101349],[36.2598598,33.5100909],[36.2597312,33.510011],[36.2596504,33.5099492],[36.2595694,33.509892],[36.2594712,33.5098024],[36.2593909,33.5097369],[36.2593246,33.509677],[36.2592855,33.5096411],[36.2592401,33.5095993],[36.259169,33.5095289],[36.2590089,33.5093648],[36.2589699,33.5093193],[36.2588242,33.5091495],[36.2586539,33.5089509],[36.2585805,33.508875],[36.2583321,33.5086179],[36.2583108,33.5085959],[36.2579572,33.5087929],[36.25742,33.5090038],[36.25664,33.5092617],[36.2562394,33.508864],[36.2557106,33.5090963]]}',
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
  const [activeKind, setActiveKind] = useState<PointKind>("origin");

  const [cardHeight, setCardHeight] = useState(0);

  // Search Bar
  const [searchText, setSearchText] = useState("");
  // المسار الناتج
  const [routeGeoJson, setRouteGeoJson] = useState<any>(null);

  // حالة حساب المسار
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [boardingPoints, setBoardingPoints] = useState<LngLat[]>([]);
  const [alightingPoints, setAlightingPoints] = useState<LngLat[]>([]);

  const cameraRef = useRef<CameraRef>(null);
  const insets = useSafeAreaInsets();
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(
    null,
  );
  const [mapLoaded, setMapLoaded] = useState(false);

  /* =========================================================
     Offline Map Setup
  ========================================================= */

  useEffect(() => {
    async function setupOfflineMap() {
      try {
        // 1. تحميل ملف MBTiles المحلي
        const mbtilesAsset = Asset.fromModule(
          require("../../assets/damascus.mbtiles"),
        );

        await mbtilesAsset.downloadAsync();

        const dbPath = mbtilesAsset.localUri?.replace("file://", "");

        if (!dbPath) {
          throw new Error("MBTiles database path was not found.");
        }

        // 2. تجهيز مجلد الخطوط
        const fontDir = `${FileSystem.documentDirectory}fonts/Noto Sans Bold/`;

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
              require("../../assets/fonts/Noto Sans Bold/0-255.pbf"),
            ),
            fileName: "0-255.pbf",
          },
          {
            asset: Asset.fromModule(
              require("../../assets/fonts/Noto Sans Bold/1536-1791.pbf"),
            ),
            fileName: "1536-1791.pbf",
          },
        ];

        for (const glyph of glyphFiles) {
          await glyph.asset.downloadAsync();

          if (glyph.asset.localUri) {
            const destination = `${fontDir}${glyph.fileName}`;

            await FileSystem.copyAsync({
              from: glyph.asset.localUri,
              to: destination,
            });
          }
        }

        // 4. إنشاء نسخة من style.json
        const dynamicStyle = JSON.parse(JSON.stringify(mapStyleJson));

        // =====================================================
        // 5. تعديل جميع طبقات النصوص
        // =====================================================

        dynamicStyle.layers = dynamicStyle.layers.map((layer: any) => {
          // استخدام Noto Sans Bold
          if (layer.type === "symbol" && layer.layout?.["text-font"]) {
            layer.layout["text-font"] = ["Noto Sans Bold"];
          }

          // تعديل طبقات الأسماء
          if (layer.type === "symbol" && layer.layout?.["text-field"]) {
            const textField = JSON.stringify(layer.layout["text-field"]);

            const isNameLayer =
              textField.includes("name:en") || textField.includes('"name"');

            if (isNameLayer) {
              layer.layout["text-field"] = [
                "coalesce",
                ["get", "name:ar"],
                ["get", "name"],
                ["get", "name:en"],
              ];
            }
          }

          // منع نقاط الـ park من الدخول في line layers
          if (layer.type === "line" && !layer.filter) {
            layer.filter = ["!=", "$type", "Point"];
          }

          return layer;
        });

        // 6. استخدام MBTiles المحلي
        dynamicStyle.sources.openmaptiles.url = `mbtiles://${dbPath}`;

        // 7. الحد الأقصى للـZoom
        dynamicStyle.sources.openmaptiles.maxzoom = 14;

        // 8. Glyphs
        dynamicStyle.glyphs = mapStyleJson.glyphs;

        // 9. حفظ الـStyle المعدل
        setOfflineStyle(dynamicStyle);
      } catch (error) {
        console.error("Failed to load offline map assets:", error);
      }
    }

    setupOfflineMap();
  }, []);

  /* =========================================================
     Fit map to two points
  ========================================================= */

  const fitBoth = (a: LngLat, b: LngLat) => {
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

  const extractBoardingAndAlightingPoints = (
    steps: RouteStep[],
  ): {
    boardingPoints: LngLat[];
    alightingPoints: LngLat[];
  } => {
    const boardingPoints: LngLat[] = [];
    const alightingPoints: LngLat[] = [];

    for (let i = 0; i < steps.length; i++) {
      if (steps[i].edge_type !== "bus") {
        continue;
      }

      const busStep = steps[i];

      let boardingTransfer: RouteStep | undefined;
      let alightingTransfer: RouteStep | undefined;

      // آخر transfer قبل هذا الباص
      for (let j = i - 1; j >= 0; j--) {
        if (steps[j].edge_type === "bus") {
          break;
        }

        if (steps[j].edge_type === "transfer") {
          boardingTransfer = steps[j];
          break;
        }
      }

      // أول transfer بعد هذا الباص
      for (let j = i + 1; j < steps.length; j++) {
        if (steps[j].edge_type === "bus") {
          break;
        }

        if (steps[j].edge_type === "transfer") {
          alightingTransfer = steps[j];
          break;
        }
      }

      const busGeometry = JSON.parse(busStep.geojson);
      const busCoordinates = busGeometry.coordinates as number[][];

      if (!busCoordinates.length) {
        continue;
      }

      // -----------------------------
      // Boarding
      // -----------------------------
      if (boardingTransfer) {
        const transferGeometry = JSON.parse(boardingTransfer.geojson);
        const coordinates = transferGeometry.coordinates as number[][];

        if (coordinates.length) {
          const busStart = busCoordinates[0];

          const nearest = coordinates.reduce((best, point) => {
            const bestDistance =
              Math.pow(best[0] - busStart[0], 2) +
              Math.pow(best[1] - busStart[1], 2);

            const currentDistance =
              Math.pow(point[0] - busStart[0], 2) +
              Math.pow(point[1] - busStart[1], 2);

            return currentDistance < bestDistance ? point : best;
          });

          boardingPoints.push(nearest as LngLat);
        }
      }

      // -----------------------------
      // Alighting
      // -----------------------------
      if (alightingTransfer) {
        const transferGeometry = JSON.parse(alightingTransfer.geojson);
        const coordinates = transferGeometry.coordinates as number[][];

        if (coordinates.length) {
          const busEnd = busCoordinates[busCoordinates.length - 1];

          const nearest = coordinates.reduce((best, point) => {
            const bestDistance =
              Math.pow(best[0] - busEnd[0], 2) +
              Math.pow(best[1] - busEnd[1], 2);

            const currentDistance =
              Math.pow(point[0] - busEnd[0], 2) +
              Math.pow(point[1] - busEnd[1], 2);

            return currentDistance < bestDistance ? point : best;
          });

          alightingPoints.push(nearest as LngLat);
        }
      }
    }

    return {
      boardingPoints,
      alightingPoints,
    };
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
      setRouteResponse(response);
      const { boardingPoints, alightingPoints } =
        extractBoardingAndAlightingPoints(response.steps);

      setBoardingPoints(boardingPoints);
      setAlightingPoints(alightingPoints);

      // تحويل كل GeoJSON إلى Feature
      const features = response.steps.map((step) => ({
        type: "Feature",
        properties: {
          step_order: step.step_order,
          edge_type: step.edge_type,
          route_name: step.route_name,
          duration_minutes: step.duration_minutes,
        },
        geometry: JSON.parse(step.geojson),
      }));

      // FeatureCollection لاستخدامها مع MapLibre
      const featureCollection = {
        type: "FeatureCollection",
        features,
      };

      setRouteGeoJson(featureCollection);

      // حساب حدود المسار
      const coordinates = features.flatMap(
        (feature: any) => feature.geometry.coordinates,
      );

      if (coordinates.length > 0) {
        const lngs = coordinates.map((coord: number[]) => coord[0]);

        const lats = coordinates.map((coord: number[]) => coord[1]);

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
          },
        );
      }
    } catch (error) {
      console.error("Failed to calculate route:", error);
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleSearchSelect = (item: SearchItem) => {
    const lngLat: LngLat = [item.longitude, item.latitude];
    // إذا كان هناك Route قديم، نمسحه
    setRouteGeoJson(null);
    setBoardingPoints([]);
    setAlightingPoints([]);
    setRouteResponse(null);
    // تحديد النقطة الحالية
    const ok = setPoint(activeKind, lngLat);
    if (!ok) return;
    // تحريك الخريطة للمكان
    cameraRef.current?.flyTo({ center: lngLat, zoom: 16, duration: 800 });
    // إذا حددنا الانطلاق ننتقل تلقائيًا للوجهة
    if (activeKind === "origin") {
      setActiveKind("destination");
    }
    // إغلاق البحث
    setSearchText("");
  };

  /* =========================================================
     Map press
  ========================================================= */

  const handleMapPress = (lngLat: LngLat) => {
    // إذا عدّل المستخدم نقطة بعد وجود مسار،
    // نحذف المسار القديم لأنه لم يعد مطابقاً للنقطتين.
    if (routeGeoJson) {
      setRouteGeoJson(null);
      setBoardingPoints([]);
      setAlightingPoints([]);
      setRouteResponse(null);
    }

    const ok = setPoint(activeKind, lngLat);

    if (!ok) return;

    const other = activeKind === "origin" ? destination : origin;

    if (other) {
      fitBoth(lngLat, other.lngLat);
    } else if (activeKind === "origin") {
      // بعد الانطلاق ننتقل تلقائياً للوجهة
      setActiveKind("destination");
    }
  };

  /* =========================================================
     Locate Me
  ========================================================= */

  const handleLocate = async () => {
    // إذا كان هناك مسار قديم نحذفه
    if (routeGeoJson) {
      setRouteGeoJson(null);
      setBoardingPoints([]);
      setAlightingPoints([]);
      setRouteResponse(null);
    }

    const result = await locateMe();

    if (!result) return;

    if (destination) {
      fitBoth(result.lngLat, destination.lngLat);
    } else {
      setActiveKind("destination");

      cameraRef.current?.flyTo({
        center: result.lngLat,
        zoom: 16,
        duration: 800,
      });
    }
  };

  const showCard = origin !== null || destination !== null;

  const cardSpace = showCard ? cardHeight + 12 : 8;

  const searchQuery = searchText.trim().toLowerCase();
  const searchResults = searchQuery
    ? SEARCH_DATA.filter((item) => {
        const name = item.name?.toLowerCase() ?? "";
        const nameAr = item.nameAr?.toLowerCase() ?? "";
        const nameEn = item.nameEn?.toLowerCase() ?? "";
        return (
          name.includes(searchQuery) ||
          nameAr.includes(searchQuery) ||
          nameEn.includes(searchQuery)
        );
      }).slice(0, 10)
    : [];
  /* =========================================================
     Loading screen
  ========================================================= */

  if (!offlineStyle) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E5484D" />
        <Text style={styles.loadingText}>يتم تحميل الخريطة...</Text>
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
        onDidFinishLoadingMap={() => setMapLoaded(true)}
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

        {/* =================================================
            Route
        ================================================= */}

        {routeGeoJson && (
          <GeoJSONSource id="trip-route" data={routeGeoJson}>
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
                "in",
                ["get", "edge_type"],
                ["literal", ["walk", "transfer"]],
              ]}
              paint={{
                "line-color": "#888888",
                "line-width": 4,
                "line-dasharray": [2, 2],
              }}
              layout={{
                "line-cap": "round",
                "line-join": "round",
              }}
            />

            {/* Bus */}
            <Layer
              id="trip-route-bus"
              type="line"
              filter={["==", ["get", "edge_type"], "bus"]}
              paint={{
                "line-color": "#E5484D",
                "line-width": 7,
              }}
              layout={{
                "line-cap": "round",
                "line-join": "round",
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
              setBoardingPoints([]);
              setAlightingPoints([]);
              setRouteResponse(null);

              setPoint("origin", event.nativeEvent.lngLat as LngLat);
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
              setBoardingPoints([]);
              setAlightingPoints([]);
              setRouteResponse(null);

              setPoint("destination", event.nativeEvent.lngLat as LngLat);
            }}
          >
            <Pin color={COLORS.destination} />
          </ViewAnnotation>
        )}

        {boardingPoints.map((point, index) => (
          <ViewAnnotation
            key={`boarding-${index}`}
            id={`boarding-${index}`}
            lngLat={point}
            anchor="center"
          >
            <View style={styles.boardingMapMarker}>
              <Text style={styles.boardingMapMarkerText}>↑</Text>
            </View>
          </ViewAnnotation>
        ))}

        {alightingPoints.map((point, index) => (
          <ViewAnnotation
            key={`alighting-${index}`}
            id={`alighting-${index}`}
            lngLat={point}
            anchor="center"
          >
            <View style={styles.routePointMarker}>
              <Text style={styles.routePointIcon}>↓</Text>
              <Text style={styles.routePointLabel}>نزول</Text>
            </View>
          </ViewAnnotation>
        ))}
      </Map>

      {!mapLoaded && (
        <View style={styles.mapLoader}>
          <ActivityIndicator size="large" color="#E5484D" />
          <Text style={styles.mapLoaderText}>يتم تحميل الخريطة...</Text>
        </View>
      )}

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
          <Text style={styles.searchIcon}>🔍</Text>

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder={
              activeKind === "origin"
                ? "ابحث عن نقطة الانطلاق"
                : "ابحث عن الوجهة"
            }
            placeholderTextColor="#888"
            style={styles.searchInput}
            textAlign="right"
            autoCorrect={false}
          />

          {searchText.length > 0 && (
            <Pressable
              onPress={() => setSearchText("")}
              style={styles.searchClear}
            >
              <Text style={styles.searchClearText}>×</Text>
            </Pressable>
          )}
        </View>

        {searchQuery.length > 0 && searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((item, index) => (
              <Pressable
                key={`${item.longitude}-${item.latitude}-${index}`}
                style={styles.searchResult}
                onPress={() => handleSearchSelect(item)}
              >
                <View style={styles.searchResultText}>
                  <Text style={styles.searchResultArabic} numberOfLines={1}>
                    {item.nameAr || item.name || item.nameEn || "بدون اسم"}
                  </Text>

                  {item.nameEn && item.nameEn !== item.nameAr && (
                    <Text style={styles.searchResultEnglish} numberOfLines={1}>
                      {item.nameEn}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {searchQuery.length > 0 && searchResults.length === 0 && (
          <View style={styles.noSearchResults}>
            <Text style={styles.noSearchResultsText}>لا توجد نتائج</Text>
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
          {(["origin", "destination"] as const).map((kind) => {
            const active = activeKind === kind;

            const isSet =
              kind === "origin" ? origin !== null : destination !== null;

            return (
              <Pressable
                key={kind}
                style={[
                  styles.chip,
                  active && {
                    backgroundColor: COLORS[kind],
                    borderColor: COLORS[kind],
                  },
                ]}
                onPress={() => setActiveKind(kind)}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {isSet ? "✓ " : ""}
                  {LABELS[kind]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.bannerText}>
          {error ? ERROR_MESSAGES[error] : HINTS[activeKind]}
        </Text>

        {error === "blocked" && (
          <Pressable onPress={() => Linking.openSettings()}>
            <Text style={styles.bannerLink}>فتح الإعدادات</Text>
          </Pressable>
        )}
      </View>

      {/* ===================================================
          GPS Button
      =================================================== */}
      {routeResponse === null && (
        <>
          <Pressable
            style={[
              styles.locateButton,
              {
                bottom: insets.bottom + 16 + cardSpace,
              },
            ]}
            onPress={handleLocate}
            disabled={locating}
            accessibilityLabel="استخدم موقعي الحالي كنقطة انطلاق"
          >
            <Text style={styles.locateButtonText}>
              {locating ? "..." : "📍 موقعي"}
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
                  bottom: insets.bottom + 16,
                },
              ]}
              onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
            >
              <PointRow
                kind="origin"
                point={origin}
                onClear={() => {
                  setRouteGeoJson(null);
                  setBoardingPoints([]);
                  setAlightingPoints([]);
                  setRouteResponse(null);
                  clearPoint("origin");
                  setActiveKind("origin");
                }}
              />

              <View style={styles.divider} />

              <PointRow
                kind="destination"
                point={destination}
                onClear={() => {
                  setRouteGeoJson(null);
                  setBoardingPoints([]);
                  setAlightingPoints([]);
                  setRouteResponse(null);
                  clearPoint("destination");
                  setActiveKind("destination");
                }}
              />

              {/* =================================================
              Calculate Route Button
          ================================================= */}

              {origin && destination && (
                <Pressable
                  style={[
                    styles.routeButton,
                    loadingRoute && styles.routeButtonDisabled,
                  ]}
                  onPress={handleCalculateRoute}
                  disabled={loadingRoute}
                >
                  <Text style={styles.routeButtonText}>
                    {loadingRoute ? "جاري حساب المسار..." : "🚌 احسب المسار"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </>
      )}

      <TripDetailsSheet
        steps={routeResponse?.steps ?? []}
        visible={routeResponse !== null}
      />
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
            backgroundColor: COLORS[kind],
          },
        ]}
      />

      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>
          {LABELS[kind]}

          {point ? ` (${point.source === "gps" ? "GPS" : "من الخريطة"})` : ""}
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
            دقة الموقع منخفضة (±
            {Math.round(point.accuracy)}
            م) — اسحب المؤشر لتصحيحه
          </Text>
        )}
      </View>

      {point && (
        <Pressable
          onPress={onClear}
          accessibilityLabel={`إلغاء ${LABELS[kind]}`}
        >
          <Text style={styles.clearText}>إلغاء</Text>
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
    backgroundColor: "#1a1a1a",
  },

  map: {
    flex: 1,
  },

  center: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    color: "white",
    marginTop: 12,
  },

  mapLoader: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },

  mapLoaderText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#555555",
  },

  /* =========================
     Top Panel
  ========================= */

  topPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.75)",
  },

  chips: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 10,
  },

  chip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
  },

  chipText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "600",
  },

  chipTextActive: {
    color: "white",
  },

  bannerText: {
    color: "white",
    fontSize: 13,
    textAlign: "right",
  },

  bannerLink: {
    color: "#7CC0FF",
    marginTop: 6,
    textAlign: "right",
  },

  /* =========================
     Locate Button
  ========================= */

  locateButton: {
    position: "absolute",
    right: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: "#208AEF",
  },

  locateButtonText: {
    color: "white",
    fontWeight: "600",
  },

  /* =========================
     Card
  ========================= */

  card: {
    position: "absolute",
    left: 12,
    right: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "white",
  },

  divider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginVertical: 10,
  },

  /* =========================
     Point Row
  ========================= */

  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
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
    fontWeight: "600",
    textAlign: "right",
  },

  rowCoords: {
    color: "#555",
    marginTop: 2,
    textAlign: "right",
  },

  rowEmpty: {
    color: "#999",
    marginTop: 2,
    textAlign: "right",
  },

  rowWarning: {
    color: "#B54B45",
    marginTop: 4,
    fontSize: 12,
    textAlign: "right",
  },

  clearText: {
    color: "#B54B45",
    fontWeight: "600",
    paddingHorizontal: 8,
  },

  /* =========================
     Route Button
  ========================= */

  routeButton: {
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#208AEF",
    alignItems: "center",
  },

  routeButtonDisabled: {
    opacity: 0.6,
  },

  routeButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  /* ========================= Search Bar ========================= */ searchContainer:
    { position: "absolute", left: 12, right: 12, zIndex: 20 },
  searchBar: {
    height: 50,
    backgroundColor: "white",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  searchIcon: { fontSize: 20, marginLeft: 8 },
  searchInput: {
    flex: 1,
    height: 50,
    color: "#222",
    fontSize: 15,
    paddingHorizontal: 8,
  },
  searchClear: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  searchClearText: { fontSize: 24, color: "#777", lineHeight: 26 },
  searchResults: {
    marginTop: 6,
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  searchResult: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  searchResultText: { flex: 1 },
  searchResultArabic: {
    color: "#222",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  searchResultEnglish: {
    color: "#777",
    fontSize: 12,
    marginTop: 3,
    textAlign: "right",
  },
  noSearchResults: {
    marginTop: 6,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 15,
  },
  noSearchResultsText: { color: "#777", textAlign: "right", fontSize: 14 },
  routePointMarker: {
    alignItems: "center",
    justifyContent: "center",
  },

  routePointIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#E5484D",
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#E5484D",
    overflow: "hidden",
  },

  routePointLabel: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    color: "#222222",
  },
  boardingMapMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#36A269",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  boardingMapMarkerText: {
    color: "#36A269",
    fontSize: 20,
    fontWeight: "800",
  },
});
