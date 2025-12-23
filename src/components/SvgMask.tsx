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
  // Use ref for currentStep to avoid recreating animationListener on step changes
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;
  // Track last animation target to prevent duplicate animations
  const lastAnimationTarget = useRef<{ size: ValueXY; position: ValueXY } | null>(null);

  const animationListener = useCallback(() => {
    const d: string = svgMaskPath({
      size: sizeValue,
      position: positionValue,
      canvasSize,
      step: currentStepRef.current,
    });

    if (maskRef.current) {
      maskRef.current.setNativeProps({ d });
    }
  }, [canvasSize, svgMaskPath, positionValue, sizeValue]);

  const animate = useCallback(
    (toSize: ValueXY, toPosition: ValueXY) => {
      // Skip if already animating to the same target (prevents rubber banding on double-click)
      const last = lastAnimationTarget.current;
      if (
        last &&
        last.size.x === toSize.x &&
        last.size.y === toSize.y &&
        last.position.x === toPosition.x &&
        last.position.y === toPosition.y
      ) {
        return;
      }
      lastAnimationTarget.current = { size: toSize, position: toPosition };

      // Stop any running animations before starting new ones
      sizeValue.stopAnimation();
      positionValue.stopAnimation();

      if (animated) {
        Animated.parallel([
          Animated.timing(sizeValue, {
            toValue: toSize,
            duration: animationDuration,
            easing,
            useNativeDriver: false,
          }),
          Animated.timing(positionValue, {
            toValue: toPosition,
            duration: animationDuration,
            easing,
            useNativeDriver: false,
          }),
        ]).start();
      } else {
        sizeValue.setValue(toSize);
        positionValue.setValue(toPosition);
      }
    },
    [animated, animationDuration, easing, positionValue, sizeValue]
  );

  useEffect(() => {
    const id = positionValue.addListener(animationListener);
    return () => {
      positionValue.removeListener(id);
    };
  }, [animationListener, positionValue]);

  // Use ref to avoid re-running effect when animate callback is recreated
  const animateRef = useRef(animate);
  animateRef.current = animate;

  useEffect(() => {
    if (size && position) {
      animateRef.current(size, position);
    }
  }, [position, size]);

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
            d={svgMaskPath({
              size: sizeValue,
              position: positionValue,
              canvasSize,
              step: currentStep,
            })}
          />
        </Svg>
      ) : null}
    </View>
  );
};
