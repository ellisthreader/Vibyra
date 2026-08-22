import React, { useEffect, useRef } from "react";

function Beam({ active }) {
  const path = "M228 128 C 175 122, 95 88, 18 34";
  const motionRef = useRef(null);
  const opacityRef = useRef(null);

  /* SMIL runs on the document timeline, so trigger it manually when the stage starts */
  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => {
      motionRef.current?.beginElement();
      opacityRef.current?.beginElement();
    }, 1150);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <svg
      className="pointer-events-none absolute top-[104px] right-[196px] z-[3] hidden h-[140px] w-[240px] lg:block"
      viewBox="0 0 240 140"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="beam-grad" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#7B2CFF" />
          <stop offset=".55" stopColor="#FF35C8" />
          <stop offset="1" stopColor="#FFB84D" />
        </linearGradient>
      </defs>
      <path
        d={path}
        pathLength="100"
        stroke="url(#beam-grad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="100"
        strokeDashoffset={active ? "100" : "0"}
        className={active ? "beam-draw" : ""}
        opacity="0.9"
      />
      {active && (
        <circle r="5" fill="url(#beam-grad)" opacity="0">
          <animateMotion ref={motionRef} path={path} begin="indefinite" dur="0.9s" fill="freeze" rotate="none" />
          <animate ref={opacityRef} attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" begin="indefinite" dur="0.95s" fill="freeze" />
        </circle>
      )}
    </svg>
  );
}

export default Beam;
