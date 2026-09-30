import { useEffect, useRef } from "react";
import {
    Animated,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

export type TripDetailsRouteStep = {
  step_order: number;
  edge_type: "walk" | "transfer" | "bus";
  route_name: string;
  duration_minutes: number;
  waiting_minutes?: number;
  geojson: string;
};

type Props = {
  steps: TripDetailsRouteStep[];
  visible: boolean;
};

type TimelineItem =
  | {
      type: "walk";
      step: TripDetailsRouteStep;
    }
  | {
      type: "boarding";
      step: TripDetailsRouteStep;
    }
  | {
      type: "alighting";
      step: TripDetailsRouteStep;
    }
  | {
      type: "bus";
      step: TripDetailsRouteStep;
    };

const SHEET_CLOSED = 430;
const SHEET_EXPANDED = 55;

export function TripDetailsSheet({ steps, visible }: Props) {
  const translateY = useRef(new Animated.Value(SHEET_CLOSED)).current;

  const startY = useRef(SHEET_CLOSED);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: SHEET_EXPANDED,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();

      startY.current = SHEET_EXPANDED;
    } else {
      Animated.spring(translateY, {
        toValue: SHEET_CLOSED,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();

      startY.current = SHEET_CLOSED;
    }
  }, [visible, translateY]);

  const buildTimeline = (): TimelineItem[] => {
    const result: TimelineItem[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (step.edge_type === "walk") {
        result.push({
          type: "walk",
          step,
        });

        continue;
      }

      if (step.edge_type === "bus") {
        result.push({
          type: "bus",
          step,
        });

        continue;
      }

      if (step.edge_type === "transfer") {
        let hasPreviousBus = false;
        let hasNextBus = false;

        for (let j = i - 1; j >= 0; j--) {
          if (steps[j].edge_type === "bus") {
            hasPreviousBus = true;
            break;
          }
        }

        for (let j = i + 1; j < steps.length; j++) {
          if (steps[j].edge_type === "bus") {
            hasNextBus = true;
            break;
          }
        }

        // Transfer قبل أول باص = ركوب
        if (!hasPreviousBus && hasNextBus) {
          result.push({
            type: "boarding",
            step,
          });

          continue;
        }

        // Transfer بعد آخر باص = نزول
        if (hasPreviousBus && !hasNextBus) {
          result.push({
            type: "alighting",
            step,
          });

          continue;
        }

        // Transfer بين باصين = نزول + ركوب
        if (hasPreviousBus && hasNextBus) {
          result.push({
            type: "alighting",
            step,
          });

          result.push({
            type: "boarding",
            step,
          });
        }
      }
    }

    return result;
  };

  const items = buildTimeline();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },

      onPanResponderGrant: () => {
        startY.current = SHEET_CLOSED;
      },

      onPanResponderMove: (_, gestureState) => {
        let nextY = startY.current + gestureState.dy;

        if (nextY < SHEET_EXPANDED) {
          nextY = SHEET_EXPANDED;
        }

        if (nextY > SHEET_CLOSED) {
          nextY = SHEET_CLOSED;
        }

        translateY.setValue(nextY);
      },

      onPanResponderRelease: (_, gestureState) => {
        const current = startY.current + gestureState.dy;

        const middle = (SHEET_CLOSED + SHEET_EXPANDED) / 2;

        const target = current < middle ? SHEET_EXPANDED : SHEET_CLOSED;

        Animated.spring(translateY, {
          toValue: target,
          useNativeDriver: true,
          tension: 80,
          friction: 12,
        }).start();
      },
    }),
  ).current;

  if (!visible || steps.length === 0) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          transform: [
            {
              translateY,
            },
          ],
        },
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.dragArea}>
        <View style={styles.handle} />
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>تفاصيل الرحلة</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {items.map((item, index) => (
          <TimelineRow
            key={`${item.type}-${item.step.step_order}-${index}`}
            item={item}
            stepNumber={index + 1}
            isLast={index === items.length - 1}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

function TimelineRow({
  item,
  stepNumber,
  isLast,
}: {
  item: TimelineItem;
  stepNumber: number;
  isLast: boolean;
}) {
  let icon = "";
  let iconStyle = styles.walkIcon;
  let iconTextStyle = styles.walkIconText;

  if (item.type === "boarding") {
    icon = "↑";
    iconStyle = styles.boardingIcon;
    iconTextStyle = styles.boardingIconText;
  }

  if (item.type === "alighting") {
    icon = "↓";
    iconStyle = styles.alightingIcon;
    iconTextStyle = styles.alightingIconText;
  }

  if (item.type === "bus") {
    icon = "🚌";
    iconStyle = styles.busIcon;
    iconTextStyle = styles.busIconText;
  }

  if (item.type === "walk") {
    icon = "🚶";
  }

//   return (
//     <View style={styles.row}>
//       <View style={styles.iconColumn}>
//         <View style={iconStyle}>
//           <Text style={iconTextStyle}>{icon}</Text>
//         </View>

//         {!isLast && <View style={styles.verticalLine} />}
//       </View>
//       <Text style={styles.stepNumber}>{stepNumber}</Text>
//       <View style={styles.info}>

//         {item.type === "walk" && (
//           <>
//             <Text style={styles.mainText}>مشي</Text>

//             <Text style={styles.subText}>
//               {formatMinutes(item.step.duration_minutes)}
//             </Text>
//           </>
//         )}

//         {item.type === "boarding" && (
//           <>
//             <Text style={styles.mainText}>ركوب الباص</Text>

//             {item.step.waiting_minutes !== undefined && (
//               <Text style={styles.subText}>
//                 وقت الانتظار: {formatMinutes(item.step.waiting_minutes)}
//               </Text>
//             )}
//           </>
//         )}

//         {item.type === "alighting" && (
//           <Text style={styles.mainText}>النزول من الباص</Text>
//         )}

//         {item.type === "bus" && (
//           <>
//               <Text style={styles.mainText}>
//                 {item.step.route_name || "الباص"}
//               </Text>

//             <Text style={styles.subText}>
//               {formatMinutes(item.step.duration_minutes)}
//             </Text>
//           </>
//         )}
//       </View>
//     </View>
//   );
return (
  <View style={styles.row}>
  
     <View style={styles.iconColumn}>
      <View style={iconStyle}>
        <Text style={iconTextStyle}>{icon}</Text>
      </View>

      {!isLast && <View style={styles.verticalLine} />}
    </View>

    <View style={styles.info}>
      {item.type === 'walk' && (
        <>
          <Text style={styles.mainText}>مشي</Text>
          <Text style={styles.subText}>
            {formatMinutes(item.step.duration_minutes)}
          </Text>
        </>
      )}

      {item.type === 'boarding' && (
        <>
          <Text style={styles.mainText}>ركوب الباص</Text>
          {item.step.waiting_minutes !== undefined && (
            <Text style={styles.subText}>
              وقت الانتظار: {formatMinutes(item.step.waiting_minutes)}
            </Text>
          )}
        </>
      )}

      {item.type === 'alighting' && (
        <Text style={styles.mainText}>النزول من الباص</Text>
      )}

      {item.type === 'bus' && (
        <>
          <Text style={styles.mainText}>
            {item.step.route_name || 'الباص'}
          </Text>
          <Text style={styles.subText}>
            {formatMinutes(item.step.duration_minutes)}
          </Text>
        </>
      )}
    </View>
    <Text style={styles.stepNumber}>{stepNumber}</Text>
   
  </View>
);
}

function formatMinutes(minutes?: number) {
  if (minutes === undefined || minutes === null) {
    return "";
  }

  const value = Math.round(minutes);

  if (value < 1) {
    return "أقل من دقيقة";
  }

  if (value === 1) {
    return "دقيقة واحدة";
  }

  if (value === 2) {
    return "دقيقتان";
  }

  return `${value} دقيقة`;
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 500,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,

    elevation: 20,

    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: -4,
    },

    zIndex: 100,
  },

  dragArea: {
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },

  handle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C8C8C8",
  },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },

  title: {
    fontSize: 19,
    fontWeight: "700",
    color: "#222222",
    textAlign: "right",
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 60,
  },

  row: {
    flexDirection: "row",
    minHeight: 78,
  },

  iconColumn: {
    width: 48,
    alignItems: "center",
    position: "relative",
  },

  verticalLine: {
    position: "absolute",
    top: 34,
    bottom: -2,
    width: 2,
    backgroundColor: "#D8D8D8",
  },

  info: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: 18,
    paddingLeft: 10,
  },

  mainText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#222222",
    textAlign: "right",
  },

  subText: {
    marginTop: 5,
    fontSize: 14,
    color: "#777777",
    textAlign: "right",
  },

  walkIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EEEEEE",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  walkIconText: {
    fontSize: 17,
  },

  boardingIcon: {
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

  boardingIconText: {
    color: "#36A269",
    fontSize: 20,
    fontWeight: "800",
  },

  alightingIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#E5484D",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  alightingIconText: {
    color: "#E5484D",
    fontSize: 20,
    fontWeight: "800",
  },

  busIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eaf2f4",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },

  busIconText: {
    fontSize: 17,
  },

stepNumber: {
  width: 30,
  fontSize: 19,
  fontWeight: '800',
  color: '#333333',
  textAlign: 'center',
  marginTop: 6,
  marginLeft: 14,
},
});
