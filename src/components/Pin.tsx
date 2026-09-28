import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * مؤشر pin: رأس دائري مقلوب 45° وطرفه المدبّب لتحت.
 * استخدمه داخل <ViewAnnotation anchor="bottom"> ليكون الطرف على الإحداثية بالضبط.
 */
export function Pin({ color }: { color: string }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.head, { backgroundColor: color }]}>
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 48, height: 48 },
  head: {
    position: 'absolute',
    top: 9,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderBottomRightRadius: 0,
    borderWidth: 2,
    borderColor: 'white',
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
  },
});
