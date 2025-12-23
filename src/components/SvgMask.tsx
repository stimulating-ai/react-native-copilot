import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import type { MaskProps, SvgMaskPathFunction, ValueXY } from "../types";

const AnimatedSvgPath = Animated.createAnimatedComponent(Path);
const windowDimensions = Dimensions.get("window");

const defaultSvgPath: SvgMaskPathFunction = ({
  size,
  position,
  canvasSize,
}): string => {
  const positionX = (position.x as any)._value as number;
  const positionY = (position.y as any)._value as number;
  const sizeX = (size.x as any)._value as number;
  const sizeY = (size.y as any)._value as number;

  return `M0,0H${canvasSize.x}V${canvasSize.y}H0V0ZM${positionX},${positionY}H${
    positionX + sizeX
  }V${positionY + sizeY}H${positionX}V${positionY}Z`;
};

export const SvgMask = ({
  size,
  position,
  style,
  easing = Easing.linear,
  animationDuration = 300,
  animated,
  backdropColor,
  svgMaskPath = defaultSvgPath,
  onClick,
  currentStep,
}: MaskProps) => {
  const [canvasSize, setCanvasSize] = useState<ValueXY>({
    x: windowDimensions.width,
    y: windowDimensions.height,
  });
  const sizeValue = useRef<Animated.ValueXY>(
    new Animated.ValueXY(size)
  ).current;
  const positionValue = useRef<Animated.ValueXY>(
    new Animated.ValueXY(position)
  ).current;
  const maskRef = useRef<any>(null);

  // Use refs to avoid recreating callbacks - keeps listener stable
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  const svgMaskPathRef = useRef(svgMaskPath);
  svgMaskPathRef.current = svgMaskPath;

  // Track if first render (skip animation on mount)
  const isFirstRender = useRef(true);
  // Use refs for animation config to avoid recreating animate callback
  const animationConfigRef = useRef({ easing, animationDuration, animated });
  animationConfigRef.current = { easing, animationDuration, animated };

  // Stable listener that reads all values from refs
  const animationListener = useCallback(() => {
    const d: string = svgMaskPathRef.current({
      size: sizeValue,
      position: positionValue,
      canvasSize: canvasSizeRef.current,
      step: currentStepRef.current,
    });

    if (maskRef.current) {
      maskRef.current.setNativeProps({ d });
    }
  }, [positionValue, sizeValue]);

  // Stable animate function that reads config from ref
  const animate = useCallback(
    (toSize: ValueXY, toPosition: ValueXY) => {
      const { easing: e, animationDuration: d, animated: a } = animationConfigRef.current;

      // Stop any running animations
      sizeValue.stopAnimation();
      positionValue.stopAnimation();

      if (a) {
        Animated.parallel([
          Animated.timing(sizeValue, {
            toValue: toSize,
            duration: d,
            easing: e,
            useNativeDriver: false,
          }),
          Animated.timing(positionValue, {
            toValue: toPosition,
            duration: d,
            easing: e,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        sizeValue.setValue(toSize);
        positionValue.setValue(toPosition);
      }
    },
    [positionValue, sizeValue]
  );

  // Add listener once on mount - it's now stable and won't be recreated
  useEffect(() => {
    const id = positionValue.addListener(animationListener);
    return () => {
      positionValue.removeListener(id);
    };
  }, [animationListener, positionValue]);

  // Update animated values when props change
  useEffect(() => {
    if (size && position) {
      if (isFirstRender.current) {
        // Don't animate on first render, just set values
        isFirstRender.current = false;
        sizeValue.setValue(size);
        positionValue.setValue(position);
      } else {
        // Animate to new position
        animate(size, position);
      }
    }
  }, [animate, position, size, positionValue, sizeValue]);

  // When canvasSize changes, update the path immediately
  useEffect(() => {
    animationListener();
  }, [animationListener, canvasSize]);

  // Set initial path when maskRef becomes available
  useEffect(() => {
    if (maskRef.current) {
      animationListener();
    }
  }, [animationListener]);

  const handleLayout = ({
    nativeEvent: {
      layout: { width, height },
    },
  }: LayoutChangeEvent) => {
    setCanvasSize({
      x: width,
      y: height,
    });
  };

  return (
    <View
      style={style}
      onLayout={handleLayout}
      onStartShouldSetResponder={onClick}
    >
      {canvasSize ? (
        <Svg pointerEvents="none" width={canvasSize.x} height={canvasSize.y}>
          <AnimatedSvgPath
            ref={maskRef}
            fill={backdropColor}
            fillRule="evenodd"
            strokeWidth={1}
            d=""
          />
        </Svg>
      ) : null}
    </View>
  );
};
