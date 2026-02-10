import React from 'react';

interface RoboticArmLoaderProps {
  isAnimated?: boolean;
  size?: number;
}

export default function RoboticArmLoader({ isAnimated = true, size = 40 }: RoboticArmLoaderProps) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-block'
      }}
    >
      <svg viewBox="130 130 240 240" style={{ width: '100%', height: '100%' }}>
        <defs>
          <filter id="metaball">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="17"
              result="blur"
            />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 100 -7"
              result="fluid"
            />
            <feComposite in="SourceGraphic" in2="fluid" operator="atop" />
          </filter>
        </defs>

        <style>
          {`
            .robotic-arm-segment {
              stroke: rgba(0, 0, 0, 0);
              stroke-width: 10;
              stroke-linecap: round;
            }

            .robotic-arm-joint {
              fill: rgba(122, 164, 186, 1);
              stroke-width: 5px;
            }

            #robotic-arm-mir {
              scale: -0.25;
            }

            .robotic-arm {
              filter: url("#metaball");
              scale: 0.25;
              transform-origin: 250px 250px;
            }

            ${isAnimated ? `
            .robotic-arm {
              animation: robotic-rotate 31s ease-in-out infinite;
            }

            @keyframes robotic-rotate {
              0% {
                transform: rotate(-90deg);
              }
              25% {
                transform: rotate(360deg);
              }
              50% {
                transform: rotate(90deg);
              }
              75% {
                transform: rotate(-360deg);
              }
              100% {
                transform: rotate(-90deg);
              }
            }

            .robotic-arm1 {
              transform-origin: 300px 200px;
              animation: robotic-rotate 23s ease-in-out infinite;
            }

            .robotic-arm2 {
              transform-origin: 400px 200px;
              animation: robotic-rotate 17s ease-in-out infinite;
            }

            .robotic-arm3 {
              transform-origin: 490px 200px;
              animation: robotic-rotate 11s ease-in-out infinite;
            }
            ` : ''}
          `}
        </style>

        <g className="robotic-arm">
          <line className="robotic-arm-segment" x1="250" y1="250" x2="300" y2="250" />
          <circle className="robotic-arm-joint" cx="250" cy="250" r="64" />
          <g className="robotic-arm1">
            <line className="robotic-arm-segment" x1="300" y1="250" x2="400" y2="250" />
            <circle className="robotic-arm-joint" cx="300" cy="250" r="30" />
            <g className="robotic-arm2">
              <line className="robotic-arm-segment" x1="400" y1="250" x2="490" y2="250" />
              <circle className="robotic-arm-joint" cx="400" cy="250" r="24" />
              <g className="robotic-arm3">
                <line className="robotic-arm-segment" x1="490" y1="250" x2="550" y2="250" />
                <circle className="robotic-arm-joint" cx="490" cy="250" r="16" />
              </g>
            </g>
            <g className="robotic-arm1">
              <line className="robotic-arm-segment" x1="300" y1="250" x2="400" y2="250" />
              <circle className="robotic-arm-joint" cx="300" cy="250" r="30" />
              <g className="robotic-arm2">
                <line className="robotic-arm-segment" x1="400" y1="250" x2="490" y2="250" />
                <circle className="robotic-arm-joint" cx="400" cy="250" r="8" />
                <g className="robotic-arm3">
                  <line className="robotic-arm-segment" x1="490" y1="250" x2="550" y2="250" />
                  <circle className="robotic-arm-joint" cx="490" cy="250" r="8" />
                </g>
                <g className="robotic-arm2">
                  <line className="robotic-arm-segment" x1="400" y1="250" x2="490" y2="250" />
                  <circle className="robotic-arm-joint" cx="400" cy="250" r="8" />
                  <g className="robotic-arm3">
                    <line className="robotic-arm-segment" x1="490" y1="250" x2="550" y2="250" />
                    <circle className="robotic-arm-joint" cx="490" cy="250" r="8" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>

        <g id="robotic-arm-mir" className="robotic-arm">
          <line className="robotic-arm-segment" x1="250" y1="250" x2="300" y2="250" />
          <circle className="robotic-arm-joint" cx="250" cy="250" r="64" />
          <g className="robotic-arm1">
            <line className="robotic-arm-segment" x1="300" y1="250" x2="400" y2="250" />
            <circle className="robotic-arm-joint" cx="300" cy="250" r="30" />
            <g className="robotic-arm2">
              <line className="robotic-arm-segment" x1="400" y1="250" x2="490" y2="250" />
              <circle className="robotic-arm-joint" cx="400" cy="250" r="24" />
              <g className="robotic-arm3">
                <line className="robotic-arm-segment" x1="490" y1="250" x2="550" y2="250" />
                <circle className="robotic-arm-joint" cx="490" cy="250" r="16" />
              </g>
            </g>
            <g className="robotic-arm1">
              <line className="robotic-arm-segment" x1="300" y1="250" x2="400" y2="250" />
              <circle className="robotic-arm-joint" cx="300" cy="250" r="30" />
              <g className="robotic-arm2">
                <line className="robotic-arm-segment" x1="400" y1="250" x2="490" y2="250" />
                <circle className="robotic-arm-joint" cx="400" cy="250" r="8" />
                <g className="robotic-arm3">
                  <line className="robotic-arm-segment" x1="490" y1="250" x2="550" y2="250" />
                  <circle className="robotic-arm-joint" cx="490" cy="250" r="8" />
                </g>
                <g className="robotic-arm2">
                  <line className="robotic-arm-segment" x1="400" y1="250" x2="490" y2="250" />
                  <circle className="robotic-arm-joint" cx="400" cy="250" r="8" />
                  <g className="robotic-arm3">
                    <line className="robotic-arm-segment" x1="490" y1="250" x2="550" y2="250" />
                    <circle className="robotic-arm-joint" cx="490" cy="250" r="8" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
