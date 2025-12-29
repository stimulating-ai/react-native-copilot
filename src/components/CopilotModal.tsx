import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Modal,
  NativeModules,
  Platform,
  StatusBar,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCopilot } from "../contexts/CopilotProvider";
import type { CopilotOptions } from "../types";
import { StepNumber } from "./default-ui/StepNumber";
import { Tooltip } from "./default-ui/Tooltip";
import {
  ARROW_SIZE,
  MARGIN,
  STEP_NUMBER_DIAMETER,
  STEP_NUMBER_RADIUS,
  styles,
} from "./style";

// Setting opacity to 0.02 to workaround glass view opacity bug.
const OPACITY_STARTING_VALUE = 1;

// Stable default easing to avoid recreating on every render
const DEFAULT_EASING = Easing.elastic(0.7);

type Props = CopilotOptions;

const noop = () => {};

const makeDefaultLayout = (): LayoutRectangle => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
});

export interface CopilotModalHandle {
  animateMove: (obj: LayoutRectangle) => Promise<void>;
}

export const CopilotModal = forwardRef<CopilotModalHandle, Props>(
  function CopilotModal(
    {
      easing = DEFAULT_EASING,
      animationDuration = 400,
      tooltipComponent: TooltipComponent = Tooltip,
      tooltipStyle = {},
      stepNumberComponent: StepNumberComponent = StepNumber,
      overlay = typeof NativeModules.RNSVGSvgViewManager !== "undefined"
        ? "svg"
        : "view",
      animated = typeof NativeModules.RNSVGSvgViewManager !== "undefined",
      androidStatusBarVisible = false,
      backdropColor = "rgba(0, 0, 0, 0.4)",
      labels = {
        finish: "Finish",
        next: "Next",
        previous: "Previous",
        skip: "Skip",
      },
      svgMaskPath,
      stopOnOutsideClick = false,
      arrowColor = "#fff",
      arrowSize = ARROW_SIZE,
      margin = MARGIN,
    },
    ref,
  ) {
    const { stop, currentStep, visible } = useCopilot();
    const insets = useSafeAreaInsets();
    const [tooltipStyles, setTooltipStyles] = useState({});
    const [arrowStyles, setArrowStyles] = useState({});
    const [animatedValues] = useState({
      top: new Animated.Value(0),
      stepNumberLeft: new Animated.Value(0),
    });
    const layoutRef = useRef(makeDefaultLayout());
    const [layout, setLayout] = useState<LayoutRectangle | undefined>(
      undefined,
    );
    const [maskRect, setMaskRect] = useState<LayoutRectangle | undefined>();

    const [isAnimated, setIsAnimated] = useState(false);
    const [containerVisible, setContainerVisible] = useState(false);
    const [tooltipHeight, setTooltipHeight] = useState(0);
    const tooltipHeightRef = useRef(0);
    const currentRectRef = useRef<{
      rect: LayoutRectangle;
      stepName: string | undefined;
      calculatedWithHeight: number;
    } | null>(null);
    const animateMoveRef = useRef<(rect: LayoutRectangle) => Promise<void>>();
    // Use ref to always have latest step name (avoids stale closure issues)
    const currentStepNameRef = useRef(currentStep?.name);
    currentStepNameRef.current = currentStep?.name;
    const [tooltipOpacity] = useState(
      () => new Animated.Value(OPACITY_STARTING_VALUE),
    );

    useEffect(() => {
      if (visible) {
        setContainerVisible(true);
      }
    }, [visible]);

    useEffect(() => {
      if (tooltipHeight > 0) {
        Animated.timing(tooltipOpacity, {
          toValue: 1,
          duration: 100,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start();
      } else {
        tooltipOpacity.setValue(OPACITY_STARTING_VALUE);
      }
    }, [tooltipHeight, tooltipOpacity]);

    // Re-calculate tooltip position when height changes to ensure it stays within safe area
    useEffect(() => {
      if (
        tooltipHeight > 0 &&
        currentRectRef.current &&
        currentRectRef.current.calculatedWithHeight !== tooltipHeight &&
        currentRectRef.current.stepName === currentStepNameRef.current
      ) {
        // Re-run positioning with the same rect now that we know the actual height
        void animateMoveRef.current?.(currentRectRef.current.rect);
      }
    }, [tooltipHeight]);

    useEffect(() => {
      if (!visible) {
        reset();
      }
    }, [visible]);

    const handleLayoutChange = ({
      nativeEvent: { layout: newLayout },
    }: LayoutChangeEvent) => {
      layoutRef.current = newLayout;
    };

    const measure = async (): Promise<LayoutRectangle> => {
      return await new Promise((resolve) => {
        const updateLayout = () => {
          if (layoutRef.current.width !== 0) {
            resolve(layoutRef.current);
          } else {
            requestAnimationFrame(updateLayout);
          }
        };

        updateLayout();
      });
    };

    const _animateMove = useCallback(
      async (rect: LayoutRectangle) => {
        currentRectRef.current = {
          rect: { ...rect },
          stepName: currentStepNameRef.current,
          calculatedWithHeight: tooltipHeightRef.current,
        };
        const newMeasuredLayout = await measure();
        if (!androidStatusBarVisible && Platform.OS === "android") {
          rect.y -= StatusBar.currentHeight ?? 0;
        }

        let stepNumberLeft = rect.x - STEP_NUMBER_RADIUS;

        if (stepNumberLeft < 0) {
          stepNumberLeft = rect.x + rect.width - STEP_NUMBER_RADIUS;
          if (stepNumberLeft > newMeasuredLayout.width - STEP_NUMBER_DIAMETER) {
            stepNumberLeft = newMeasuredLayout.width - STEP_NUMBER_DIAMETER;
          }
        }

        const center = {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };

        const relativeToLeft = center.x;
        const relativeToTop = center.y;
        const relativeToBottom = Math.abs(center.y - newMeasuredLayout.height);
        const relativeToRight = Math.abs(center.x - newMeasuredLayout.width);

        // Calculate available space above and below the target element
        const spaceAbove = rect.y - insets.top - margin;
        const spaceBelow = newMeasuredLayout.height - (rect.y + rect.height) - insets.bottom - margin;

        // Choose vertical position based on available space, preferring below
        // If we know the tooltip height, use it to make a smarter decision
        const knownHeight = tooltipHeightRef.current;
        let verticalPosition: "bottom" | "top";
        if (knownHeight > 0) {
          // If tooltip fits below, use below; otherwise use above if it fits; otherwise use whichever has more space
          if (spaceBelow >= knownHeight) {
            verticalPosition = "bottom";
          } else if (spaceAbove >= knownHeight) {
            verticalPosition = "top";
          } else {
            verticalPosition = spaceBelow >= spaceAbove ? "bottom" : "top";
          }
        } else {
          // Fall back to original logic when height is unknown
          verticalPosition = relativeToBottom > relativeToTop ? "bottom" : "top";
        }
        const horizontalPosition =
          relativeToLeft > relativeToRight ? "left" : "right";

        const tooltip: ViewStyle = {};
        const arrow: ViewStyle = {};

        arrow.position = "absolute";

        if (verticalPosition === "bottom") {
          const idealTop = rect.y + rect.height + margin;
          // Clamp tooltip.top so the bottom edge doesn't exceed safe area (use ref for latest value)
          const maxTop =
            knownHeight > 0
              ? newMeasuredLayout.height - knownHeight - insets.bottom - margin
              : idealTop;
          tooltip.top = Math.max(Math.min(idealTop, maxTop), insets.top + margin);
          arrow.borderBottomColor = arrowColor;
          arrow.borderTopColor = "transparent";
          arrow.borderLeftColor = "transparent";
          arrow.borderRightColor = "transparent";
          arrow.top = tooltip.top - arrowSize * 2;
        } else {
          tooltip.bottom = newMeasuredLayout.height - (rect.y - margin);
          // Clamp so tooltip stays within safe area
          // Minimum bottom = margin + insets.bottom (tooltip can't go below safe area)
          const minBottom = margin + insets.bottom;
          // Maximum bottom = layoutHeight - knownHeight - insets.top - margin (top of tooltip can't go above safe area)
          const maxBottom = knownHeight > 0
            ? newMeasuredLayout.height - knownHeight - insets.top - margin
            : tooltip.bottom;
          tooltip.bottom = Math.max(Math.min(tooltip.bottom, maxBottom), minBottom);
          arrow.borderTopColor = arrowColor;
          arrow.borderLeftColor = "transparent";
          arrow.borderRightColor = "transparent";
          arrow.borderBottomColor = "transparent";
          arrow.bottom = tooltip.bottom - arrowSize * 2;
        }

        if (horizontalPosition === "left") {
          tooltip.right = Math.max(
            newMeasuredLayout.width - (rect.x + rect.width),
            0,
          );
          tooltip.right =
            tooltip.right === 0 ? tooltip.right + margin : tooltip.right;
          tooltip.maxWidth = newMeasuredLayout.width - tooltip.right - margin;
          arrow.right = tooltip.right + margin;
        } else {
          tooltip.left = Math.max(rect.x, 0);
          tooltip.left =
            tooltip.left === 0 ? tooltip.left + margin : tooltip.left;
          tooltip.maxWidth = newMeasuredLayout.width - tooltip.left - margin;
          arrow.left = tooltip.left + margin;
        }

        sanitize(arrow);
        sanitize(tooltip);
        sanitize(rect);

        const animate = [
          ["top", rect.y],
          ["stepNumberLeft", stepNumberLeft],
        ] as const;

        // Stop any running animations before starting new ones
        animatedValues.top.stopAnimation();
        animatedValues.stepNumberLeft.stopAnimation();

        setTooltipStyles(tooltip);
        setArrowStyles(arrow);
        setLayout(newMeasuredLayout);
        setMaskRect({
          width: rect.width,
          height: rect.height,
          x: Math.floor(Math.max(rect.x, 0)),
          y: Math.floor(Math.max(rect.y, 0)),
        });

        // Wait for animation to complete before resolving
        await new Promise<void>((resolve) => {
          if (isAnimated) {
            Animated.parallel(
              animate.map(([key, value]) => {
                return Animated.timing(animatedValues[key], {
                  toValue: value,
                  duration: animationDuration,
                  easing,
                  useNativeDriver: false,
                });
              }),
            ).start(() => resolve());
          } else {
            animate.forEach(([key, value]) => {
              animatedValues[key].setValue(value);
            });
            resolve();
          }
        });
      },
      [
        androidStatusBarVisible,
        animatedValues,
        animationDuration,
        arrowColor,
        easing,
        insets,
        isAnimated,
        arrowSize,
        margin,
      ],
    );

    animateMoveRef.current = _animateMove;

    const animateMove = useCallback<CopilotModalHandle["animateMove"]>(
      async (rect) => {
        await new Promise<void>((resolve) => {
          const frame = async () => {
            await _animateMove(rect);
            resolve();
          };

          setContainerVisible(true);
          requestAnimationFrame(() => {
            void frame();
          });
        });
      },
      [_animateMove],
    );

    const reset = () => {
      setIsAnimated(false);
      setContainerVisible(false);
      setLayout(undefined);
      setMaskRect(undefined);
      setTooltipStyles({});
      setArrowStyles({});
      setTooltipHeight(0);
      tooltipHeightRef.current = 0;
      currentRectRef.current = null;
      layoutRef.current = makeDefaultLayout();
      animatedValues.top.setValue(0);
      animatedValues.stepNumberLeft.setValue(0);
      tooltipOpacity.setValue(OPACITY_STARTING_VALUE);
    };

    const handleStop = () => {
      reset();
      void stop();
    };

    const handleMaskClick = () => {
      if (stopOnOutsideClick) {
        handleStop();
      }
    };

    useImperativeHandle(
      ref,
      () => {
        return {
          animateMove,
        };
      },
      [animateMove],
    );

    const modalVisible = containerVisible || visible;
    const contentVisible = layout != null && containerVisible;

    // Memoize size and position to prevent unnecessary re-renders/animations
    const maskSize = useMemo(
      () =>
        maskRect && {
          x: maskRect.width,
          y: maskRect.height,
        },
      [maskRect?.width, maskRect?.height],
    );

    const maskPosition = useMemo(
      () =>
        maskRect && {
          x: maskRect.x,
          y: maskRect.y,
        },
      [maskRect?.x, maskRect?.y],
    );

    if (!modalVisible) {
      return null;
    }

    return (
      <Modal
        animationType="none"
        visible
        onRequestClose={noop}
        transparent
        supportedOrientations={["portrait", "landscape"]}
      >
        <View style={styles.container} onLayout={handleLayoutChange}>
          {contentVisible && renderTooltip()}
          {contentVisible && renderMask()}
        </View>
      </Modal>
    );

    function renderMask() {
      const MaskComponent =
        overlay === "svg"
          ? // eslint-disable-next-line @typescript-eslint/no-var-requires
            require("./SvgMask").SvgMask
          : // eslint-disable-next-line @typescript-eslint/no-var-requires
            require("./ViewMask").ViewMask;

      return (
        <MaskComponent
          animated={animated}
          layout={layout}
          style={styles.overlayContainer}
          size={maskSize}
          position={maskPosition}
          easing={easing}
          animationDuration={animationDuration}
          backdropColor={backdropColor}
          svgMaskPath={svgMaskPath}
          onClick={handleMaskClick}
          currentStep={currentStep}
        />
      );
    }

    function renderTooltip() {
      if (!currentStep) {
        return null;
      }
      return (
        <>
          <Animated.View
            key="stepNumber"
            style={[
              styles.stepNumberContainer,
              {
                left: animatedValues.stepNumberLeft,
                top: Animated.add(animatedValues.top, -STEP_NUMBER_RADIUS),
              },
            ]}
          >
            <StepNumberComponent />
          </Animated.View>
          {!!arrowSize && (
            <Animated.View
              key="arrow"
              style={[styles.arrow, arrowStyles, { opacity: tooltipOpacity }]}
            />
          )}
          <Animated.View
            key="tooltip"
            style={[
              styles.tooltip,
              tooltipStyles,
              tooltipStyle,
              { opacity: tooltipOpacity },
            ]}
            onLayout={(e) => {
              const newHeight = e.nativeEvent.layout.height;
              tooltipHeightRef.current = newHeight;
              setTooltipHeight(newHeight);
            }}
          >
            <TooltipComponent labels={labels} />
          </Animated.View>
        </>
      );
    }
  },
);

const floorify = (obj: Record<string, any>) => {
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === "number") {
      obj[key] = Math.floor(obj[key]);
    }
  });
};

const removeNan = (obj: Record<string, any>) => {
  Object.keys(obj).forEach((key) => {
    if (typeof obj[key] === "number" && isNaN(obj[key])) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete obj[key];
    }
  });
};

const sanitize = (obj: Record<any, any>) => {
  floorify(obj);
  removeNan(obj);
};
