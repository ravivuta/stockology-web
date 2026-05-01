"use client";

import React, { useEffect, useRef, useState, useId } from "react";

export interface GlassSurfaceProps {
  children?: React.ReactNode;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  borderWidth?: number;
  brightness?: number;
  opacity?: number;
  blur?: number;
  displace?: number;
  backgroundOpacity?: number;
  saturation?: number;
  distortionScale?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  xChannel?: "R" | "G" | "B";
  yChannel?: "R" | "G" | "B";
  mixBlendMode?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "color-dodge"
    | "color-burn"
    | "hard-light"
    | "soft-light"
    | "difference"
    | "exclusion"
    | "hue"
    | "saturation"
    | "color"
    | "luminosity"
    | "plus-darker"
    | "plus-lighter";
  className?: string;
  style?: React.CSSProperties;
  /** Landing is always dark; use "dark" so glass matches the void background. */
  theme?: "system" | "dark" | "light";
  /**
   * When true, skip full SVG chromatic displacement. Use `subtleWarp` for a tiny single-pass warp.
   */
  flat?: boolean;
  /**
   * With `flat`: optional very mild displacement (one map, no RGB split). Chrome/Chromium only; others get frosted blur.
   */
  subtleWarp?: boolean;
  /** Displacement strength when `subtleWarp` is on (small negative ≈ slight bend). Default -11. */
  subtleWarpScale?: number;
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return isDark;
}

function supportsBackdropFilter(): boolean {
  if (typeof window === "undefined") return false;
  return CSS.supports("backdrop-filter", "blur(10px)");
}

function browserBlocksChromaticDisplacement(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  const isWebkit = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  return isWebkit || isFirefox;
}

export default function GlassSurface({
  children,
  width = 200,
  height = 80,
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 50,
  opacity = 0.93,
  blur = 11,
  displace = 0,
  backgroundOpacity = 0,
  saturation = 1,
  distortionScale = -180,
  redOffset = 0,
  greenOffset = 10,
  blueOffset = 20,
  xChannel = "R",
  yChannel = "G",
  mixBlendMode = "difference",
  className = "",
  style = {},
  theme = "system",
  flat = false,
  subtleWarp = false,
  subtleWarpScale = -11,
}: GlassSurfaceProps) {
  const uniqueId = useId().replace(/:/g, "-");
  const filterId = `glass-filter-${uniqueId}`;
  const subtleFilterId = `glass-subtle-${uniqueId}`;
  const redGradId = `red-grad-${uniqueId}`;
  const blueGradId = `blue-grad-${uniqueId}`;

  const [svgSupported, setSvgSupported] = useState(false);
  const [subtleSvgSupported, setSubtleSvgSupported] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const feImageRef = useRef<SVGFEImageElement>(null);
  const feImageSubtleRef = useRef<SVGFEImageElement>(null);
  const redChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const greenChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const blueChannelRef = useRef<SVGFEDisplacementMapElement>(null);
  const gaussianBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const subtleDispRef = useRef<SVGFEDisplacementMapElement>(null);

  const systemDark = useDarkMode();
  const isDarkMode = theme === "system" ? systemDark : theme === "dark";

  const generateDisplacementMap = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const actualWidth = rect?.width || 400;
    const actualHeight = rect?.height || 200;
    const edgeSize = Math.min(actualWidth, actualHeight) * (borderWidth * 0.5);

    const svgContent = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/>
            <stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" fill="black"></rect>
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${redGradId})" />
        <rect x="0" y="0" width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${mixBlendMode}" />
        <rect x="${edgeSize}" y="${edgeSize}" width="${actualWidth - edgeSize * 2}" height="${actualHeight - edgeSize * 2}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)" />
      </svg>
    `;

    return `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
  };

  const updateDisplacementMap = () => {
    const href = generateDisplacementMap();
    feImageRef.current?.setAttribute("href", href);
    feImageSubtleRef.current?.setAttribute("href", href);
  };

  /* eslint-disable react-hooks/exhaustive-deps -- SVG map reads layout via refs; ResizeObserver also updates */
  useEffect(() => {
    if (flat && !subtleWarp) return;
    updateDisplacementMap();
    if (flat && subtleWarp) {
      subtleDispRef.current?.setAttribute("scale", String(subtleWarpScale));
      subtleDispRef.current?.setAttribute("xChannelSelector", "R");
      subtleDispRef.current?.setAttribute("yChannelSelector", "G");
      return;
    }
    [
      { ref: redChannelRef, offset: redOffset },
      { ref: greenChannelRef, offset: greenOffset },
      { ref: blueChannelRef, offset: blueOffset },
    ].forEach(({ ref, offset }) => {
      if (ref.current) {
        ref.current.setAttribute("scale", (distortionScale + offset).toString());
        ref.current.setAttribute("xChannelSelector", xChannel);
        ref.current.setAttribute("yChannelSelector", yChannel);
      }
    });

    gaussianBlurRef.current?.setAttribute("stdDeviation", displace.toString());
  }, [
    flat,
    subtleWarp,
    subtleWarpScale,
    width,
    height,
    borderRadius,
    borderWidth,
    brightness,
    opacity,
    blur,
    displace,
    distortionScale,
    redOffset,
    greenOffset,
    blueOffset,
    xChannel,
    yChannel,
    mixBlendMode,
    redGradId,
    blueGradId,
  ]);

  useEffect(() => {
    if (flat && !subtleWarp) {
      setSvgSupported(false);
      setSubtleSvgSupported(false);
      return;
    }
    if (browserBlocksChromaticDisplacement()) {
      setSvgSupported(false);
      setSubtleSvgSupported(false);
      return;
    }
    if (typeof document === "undefined") return;
    const div = document.createElement("div");
    if (flat && subtleWarp) {
      div.style.backdropFilter = `url(#${subtleFilterId})`;
      setSubtleSvgSupported(div.style.backdropFilter !== "");
      setSvgSupported(false);
      return;
    }
    div.style.backdropFilter = `url(#${filterId})`;
    setSvgSupported(div.style.backdropFilter !== "");
    setSubtleSvgSupported(false);
  }, [filterId, subtleFilterId, flat, subtleWarp]);

  useEffect(() => {
    if ((flat && !subtleWarp) || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateDisplacementMap);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [flat, subtleWarp]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const getContainerStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      width: typeof width === "number" ? `${width}px` : width,
      height: typeof height === "number" ? `${height}px` : height,
      borderRadius: `${borderRadius}px`,
      "--glass-frost": backgroundOpacity,
      "--glass-saturation": saturation,
    } as React.CSSProperties;

    const backdropFilterSupported = supportsBackdropFilter();
    const useLensBackdrop = !flat && svgSupported;
    const useSubtleBackdrop = flat && subtleWarp && subtleSvgSupported && backdropFilterSupported;

    /** Frosted sheet: light veil + dark base so it reads as glass, not blur-only mush. */
    const marketingGlassBackground = (baseAlpha: number) =>
      isDarkMode
        ? `linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 42%, hsl(0 0% 0% / ${Math.max(0.04, baseAlpha)}) 100%)`
        : `linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,${Math.max(0.15, baseAlpha)}) 100%)`;

    if (useSubtleBackdrop && isDarkMode) {
      const blurPx = Math.max(0, blur);
      const sat = Math.max(0.85, saturation);
      return {
        ...baseStyles,
        background: marketingGlassBackground(backgroundOpacity),
        backdropFilter: `blur(${blurPx}px) saturate(${sat}) url(#${subtleFilterId})`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(${sat}) url(#${subtleFilterId})`,
        border: "1px solid rgba(255, 255, 255, 0.14)",
        boxShadow:
          "inset 0 1px 0 0 rgba(255, 255, 255, 0.14), inset 0 -1px 0 0 rgba(0, 0, 0, 0.12)",
      };
    }

    if (useSubtleBackdrop && !isDarkMode) {
      const blurPx = Math.max(0, blur);
      const sat = Math.max(0.85, saturation);
      return {
        ...baseStyles,
        background: marketingGlassBackground(backgroundOpacity),
        backdropFilter: `blur(${blurPx}px) saturate(${sat}) url(#${subtleFilterId})`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(${sat}) url(#${subtleFilterId})`,
        border: "1px solid rgba(255, 255, 255, 0.4)",
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.55)",
      };
    }

    if (flat && subtleWarp && !useSubtleBackdrop && backdropFilterSupported) {
      const blurPx = Math.max(0, blur);
      const sat = Math.max(0.85, saturation);
      if (isDarkMode) {
        return {
          ...baseStyles,
          background: marketingGlassBackground(backgroundOpacity),
          backdropFilter: `blur(${blurPx}px) saturate(${sat})`,
          WebkitBackdropFilter: `blur(${blurPx}px) saturate(${sat})`,
          border: "1px solid rgba(255, 255, 255, 0.14)",
          boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.12)",
        };
      }
      return {
        ...baseStyles,
        background: marketingGlassBackground(backgroundOpacity),
        backdropFilter: `blur(${blurPx}px) saturate(${sat})`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(${sat})`,
        border: "1px solid rgba(255, 255, 255, 0.35)",
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.45)",
      };
    }

    if (flat && !subtleWarp && backdropFilterSupported) {
      const blurPx = Math.max(0, blur);
      const sat = Math.max(0.85, saturation);
      if (isDarkMode) {
        return {
          ...baseStyles,
          background: marketingGlassBackground(backgroundOpacity),
          backdropFilter: `blur(${blurPx}px) saturate(${sat})`,
          WebkitBackdropFilter: `blur(${blurPx}px) saturate(${sat})`,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.1)",
        };
      }
      return {
        ...baseStyles,
        background: marketingGlassBackground(backgroundOpacity),
        backdropFilter: `blur(${blurPx}px) saturate(${sat})`,
        WebkitBackdropFilter: `blur(${blurPx}px) saturate(${sat})`,
        border: "1px solid rgba(255, 255, 255, 0.35)",
        boxShadow: "inset 0 1px 0 0 rgba(255, 255, 255, 0.45)",
      };
    }

    if (flat && !backdropFilterSupported) {
      return {
        ...baseStyles,
        background: isDarkMode ? "rgba(22, 22, 24, 0.72)" : "rgba(255, 255, 255, 0.5)",
        border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.14)" : "1px solid rgba(255, 255, 255, 0.35)",
        boxShadow: isDarkMode
          ? "inset 0 1px 0 0 rgba(255, 255, 255, 0.1)"
          : "inset 0 1px 0 0 rgba(255, 255, 255, 0.5)",
      };
    }

    if (useLensBackdrop) {
      return {
        ...baseStyles,
        background: isDarkMode ? `hsl(0 0% 0% / ${backgroundOpacity})` : `hsl(0 0% 100% / ${backgroundOpacity})`,
        backdropFilter: `url(#${filterId}) saturate(${saturation})`,
        boxShadow: isDarkMode
          ? `0 0 2px 1px color-mix(in oklch, white, transparent 65%) inset,
             0 0 10px 4px color-mix(in oklch, white, transparent 85%) inset,
             0px 4px 16px rgba(17, 17, 26, 0.05),
             0px 8px 24px rgba(17, 17, 26, 0.05),
             0px 16px 56px rgba(17, 17, 26, 0.05),
             0px 4px 16px rgba(17, 17, 26, 0.05) inset,
             0px 8px 24px rgba(17, 17, 26, 0.05) inset,
             0px 16px 56px rgba(17, 17, 26, 0.05) inset`
          : `0 0 2px 1px color-mix(in oklch, black, transparent 85%) inset,
             0 0 10px 4px color-mix(in oklch, black, transparent 90%) inset,
             0px 4px 16px rgba(17, 17, 26, 0.05),
             0px 8px 24px rgba(17, 17, 26, 0.05),
             0px 16px 56px rgba(17, 17, 26, 0.05),
             0px 4px 16px rgba(17, 17, 26, 0.05) inset,
             0px 8px 24px rgba(17, 17, 26, 0.05) inset,
             0px 16px 56px rgba(17, 17, 26, 0.05) inset`,
      };
    }

    if (isDarkMode) {
      if (!backdropFilterSupported) {
        return {
          ...baseStyles,
          background: "rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
                      inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)`,
        };
      }
      return {
        ...baseStyles,
        background: "rgba(255, 255, 255, 0.1)",
        backdropFilter: `blur(${Math.max(12, blur)}px) saturate(1.8) brightness(1.2)`,
        WebkitBackdropFilter: `blur(${Math.max(12, blur)}px) saturate(1.8) brightness(1.2)`,
        border: "1px solid rgba(255, 255, 255, 0.2)",
        boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
                    inset 0 -1px 0 0 rgba(255, 255, 255, 0.1)`,
      };
    }

    if (!backdropFilterSupported) {
      return {
        ...baseStyles,
        background: "rgba(255, 255, 255, 0.4)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        boxShadow: `inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
                    inset 0 -1px 0 0 rgba(255, 255, 255, 0.3)`,
      };
    }
    return {
      ...baseStyles,
      background: "rgba(255, 255, 255, 0.25)",
      backdropFilter: "blur(12px) saturate(1.8) brightness(1.1)",
      WebkitBackdropFilter: "blur(12px) saturate(1.8) brightness(1.1)",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      boxShadow: `0 8px 32px 0 rgba(31, 38, 135, 0.2),
                  0 2px 16px 0 rgba(31, 38, 135, 0.1),
                  inset 0 1px 0 0 rgba(255, 255, 255, 0.4),
                  inset 0 -1px 0 0 rgba(255, 255, 255, 0.2)`,
    };
  };

  const glassSurfaceClasses =
    "relative flex items-center justify-center overflow-hidden transition-opacity duration-[260ms] ease-out";

  const focusVisibleClasses = isDarkMode
    ? "focus-visible:outline-2 focus-visible:outline-[#0A84FF] focus-visible:outline-offset-2"
    : "focus-visible:outline-2 focus-visible:outline-[#007AFF] focus-visible:outline-offset-2";

  return (
    <div
      ref={containerRef}
      className={`${glassSurfaceClasses} ${focusVisibleClasses} ${className}`}
      style={getContainerStyles()}
    >
      {!flat && (
        <svg
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-0"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
              <feImage ref={feImageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />

              <feDisplacementMap ref={redChannelRef} in="SourceGraphic" in2="map" result="dispRed" />
              <feColorMatrix
                in="dispRed"
                type="matrix"
                values="1 0 0 0 0
                        0 0 0 0 0
                        0 0 0 0 0
                        0 0 0 1 0"
                result="red"
              />

              <feDisplacementMap ref={greenChannelRef} in="SourceGraphic" in2="map" result="dispGreen" />
              <feColorMatrix
                in="dispGreen"
                type="matrix"
                values="0 0 0 0 0
                        0 1 0 0 0
                        0 0 0 0 0
                        0 0 0 1 0"
                result="green"
              />

              <feDisplacementMap ref={blueChannelRef} in="SourceGraphic" in2="map" result="dispBlue" />
              <feColorMatrix
                in="dispBlue"
                type="matrix"
                values="0 0 0 0 0
                        0 0 0 0 0
                        0 0 1 0 0
                        0 0 0 1 0"
                result="blue"
              />

              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="output" />
              <feGaussianBlur ref={gaussianBlurRef} in="output" stdDeviation="0.7" />
            </filter>
          </defs>
        </svg>
      )}

      {flat && subtleWarp && (
        <svg
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-0"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id={subtleFilterId} colorInterpolationFilters="sRGB" x="-5%" y="-5%" width="110%" height="110%">
              <feImage ref={feImageSubtleRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
              <feDisplacementMap
                ref={subtleDispRef}
                in="SourceGraphic"
                in2="map"
                xChannelSelector="R"
                yChannelSelector="G"
                scale={subtleWarpScale}
              />
            </filter>
          </defs>
        </svg>
      )}

      <div className="relative z-10 flex h-full w-full items-center justify-center rounded-[inherit] p-2">{children}</div>
    </div>
  );
}
