import React from 'react';

interface TestPatternPlaceholderProps {
  width: number;
  height: number;
}

/**
 * Retro TV test pattern placeholder that matches the source image's
 * exact pixel dimensions and aspect ratio. Shown for waypoint slots
 * without a generated image.
 */
const TestPatternPlaceholder: React.FC<TestPatternPlaceholderProps> = ({ width, height }) => {
  const barCount = 7;
  const barWidth = width / barCount;

  // SMPTE-style color bars
  const topBars = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  const bottomBars = ['#0000c0', '#181828', '#c000c0', '#181828', '#00c0c0', '#181828', '#c0c0c0'];

  // Bars fill edge-to-edge, no margins
  const mainHeight = height * 0.67;
  const castTop = mainHeight;
  const castHeight = height * 0.15;
  const rampTop = castTop + castHeight;
  const rampHeight = height - rampTop;

  // Center circle
  const cx = width / 2;
  const cy = mainHeight / 2;
  const circleR = Math.min(width, mainHeight) * 0.16;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className="dimmed"
      aria-label="No image generated yet"
    >
      {/* Main color bars - full width, top to 67% */}
      {topBars.map((fill, i) => (
        <rect key={`t${i}`} x={i * barWidth} y={0} width={barWidth + 0.5} height={mainHeight} fill={fill} opacity={0.7} />
      ))}

      {/* Castellations row */}
      {bottomBars.map((fill, i) => (
        <rect key={`b${i}`} x={i * barWidth} y={castTop} width={barWidth + 0.5} height={castHeight} fill={fill} opacity={0.6} />
      ))}

      {/* Gradient ramp - fills remaining bottom */}
      <defs>
        <linearGradient id="tp-ramp" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0a0a14" />
          <stop offset="100%" stopColor="#e0e0e0" />
        </linearGradient>
      </defs>
      <rect x={0} y={rampTop} width={width} height={rampHeight + 1} fill="url(#tp-ramp)" opacity={0.5} />

      {/* Center circle + crosshair */}
      <circle cx={cx} cy={cy} r={circleR} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <line x1={cx - circleR} y1={cy} x2={cx + circleR} y2={cy} stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
      <line x1={cx} y1={cy - circleR} x2={cx} y2={cy + circleR} stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />

      {/* Label */}
      <text
        x={cx}
        y={rampTop + rampHeight * 0.65}
        textAnchor="middle"
        fontFamily="monospace"
        fontSize={Math.max(height * 0.035, 10)}
        fill="rgba(255,255,255,0.4)"
        letterSpacing="3"
      >
        NOT YET GENERATED
      </text>
    </svg>
  );
};

export default TestPatternPlaceholder;
