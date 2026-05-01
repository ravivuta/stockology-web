"use client";

/**
 * GPU-friendly infinite marquee (CSS keyframes only — no useAnimationFrame / scroll coupling).
 * Two identical halves; translate -50% loops seamlessly.
 */
export function CssMarqueeRibbon({
  row1,
  row2,
  textClassName,
}: {
  row1: string;
  row2: string;
  textClassName: string;
}) {
  const seg = (text: string) => (
    <span className={`flex shrink-0 items-center ${textClassName}`}>
      <span className="whitespace-nowrap">{text}</span>
      <span className="mx-3 text-white/25 md:mx-4" aria-hidden>
        •
      </span>
    </span>
  );

  const track = (text: string, reverse: boolean) => {
    const repeated = (
      <>
        {seg(text)}
        {seg(text)}
        {seg(text)}
        {seg(text)}
      </>
    );
    return (
      <div className="relative overflow-hidden py-2">
        <div
          className={`flex w-max motion-reduce:animate-none will-change-transform [transform:translateZ(0)] ${
            reverse ? "animate-landing-marquee-r" : "animate-landing-marquee-l"
          }`}
        >
          <div className="flex w-max">{repeated}</div>
          <div className="flex w-max" aria-hidden>
            {repeated}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="select-none" aria-hidden>
      {track(row1, false)}
      {track(row2, true)}
    </div>
  );
}
