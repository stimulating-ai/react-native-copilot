import React, { useCallback, useEffect, useRef } from "react";

import { Animated, View } from "react-native";
import { styles } from "./style";

import type { MaskProps, ValueXY } from "../types";

export const ViewMask = (props: MaskProps) => {
  const sizeValue = useRef<Animated.ValueXY>(
    new Animated.ValueXY(props.size)
  ).current;
  const positionValue = useRef<Animated.ValueXY>(
    new Animated.ValueXY(props.position)
  ).current;
  const isFirstRender = useRef(true);
  // Use refs for animation config to avoid recreating animate callback
  const animationConfigRef = useRef({
    easing: props.easing,
    animationDuration: props.animationDuration,
    animated: props.animated,
  });
  animationConfigRef.current = {
    easing: props.easing,
    animationDuration: props.animationDuration,
    animated: props.animated,
  };

  // Stable animate function that reads config from ref
  const animate = useCallback(
    (size: ValueXY, position: ValueXY): void => {
      const { easing, animationDuration, animated } = animationConfigRef.current;

      // Stop any running animations
      sizeValue.stopAnimation();
      positionValue.stopAnimation();

      if (animated) {
        Animated.parallel([
          Animated.timing(sizeValue, {
            toValue: size,
            duration: animationDuration,
            easing,
            useNativeDriver: false,
          }),
          Animated.timing(positionValue, {
            toValue: position,
            duration: animationDuration,
            easing,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        sizeValue.setValue(size);
        positionValue.setValue(position);
      }
    },
    [positionValue, sizeValue]
  );

  useEffect(() => {
    if (props.position && props.size) {
      if (isFirstRender.current) {
        isFirstRender.current = false;
        sizeValue.setValue(props.size);
        positionValue.setValue(props.position);
      } else {
        animate(props.size, props.position);
      }
    }
  }, [animate, props.position, props.size, positionValue, sizeValue]);

  const width = props.layout ? props.layout.width : 500;
  const height = props.layout ? props.layout.height : 500;

  const leftOverlayRight = Animated.add(
    width,
    Animated.multiply(positionValue.x, -1)
  );
  const rightOverlayLeft = Animated.add(sizeValue.x, positionValue.x);
  const bottomOverlayTopBoundary = Animated.add(sizeValue.y, positionValue.y);
  const topOverlayBottomBoundary = Animated.add(
    height,
    Animated.multiply(-1, positionValue.y)
  );
  const verticalOverlayLeftBoundary = positionValue.x;
  const verticalOverlayRightBoundary = Animated.add(
    width,
    Animated.multiply(-1, rightOverlayLeft)
  );

  return (
    <View style={props.style} onStartShouldSetResponder={props.onClick}>
      {[
        {
          right: leftOverlayRight,
          backgroundColor: props.backdropColor,
        },
        {
          left: rightOverlayLeft,
          backgroundColor: props.backdropColor,
        },
        {
          top: bottomOverlayTopBoundary,
          left: verticalOverlayLeftBoundary,
          right: verticalOverlayRightBoundary,
          backgroundColor: props.backdropColor,
        },
        {
          bottom: topOverlayBottomBoundary,
          left: verticalOverlayLeftBoundary,
          right: verticalOverlayRightBoundary,
          backgroundColor: props.backdropColor,
        },
      ].map((style, index) => (
        <Animated.View key={index} style={[styles.overlayRectangle, style]} />
      ))}
    </View>
  );
};
