import React, { useId } from 'react';

interface RoboticArmLoaderProps {
  isAnimated?: boolean;
  size?: number;
}

export default function RoboticArmLoader({ isAnimated = true, size = 40 }: RoboticArmLoaderProps) {
  const uid = useId().replace(/:/g, '');

  const filterId = `metaball-${uid}`;
  const mirId = `robotic-arm-mir-${uid}`;
  const cls = (name: string) => `${name}-${uid}`;

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        maxWidth: `${size}px`,
        maxHeight: `${size}px`,
        display: 'inline-block',
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      <svg viewBox="50 50 400 400" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>
        <defs>
          <filter id={filterId} x="-100%" y="-100%" width="400%" height="400%">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="12"
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
            .${cls('robotic-arm-segment')} {
              stroke: rgba(0, 0, 0, 0);
              stroke-width: 10;
              stroke-linecap: round;
            }

            .${cls('robotic-arm-joint')} {
              fill: rgba(122, 164, 186, 1);
              stroke-width: 5px;
            }

            #${mirId} {
              scale: -0.25;
            }

            .${cls('robotic-arm')} {
              filter: url("#${filterId}");
              scale: 0.25;
              transform-origin: 250px 250px;
            }

            ${isAnimated ? `
            .${cls('robotic-arm')} {
              animation: ${cls('robotic-rotate')} 31s ease-in-out infinite;
            }

            @keyframes ${cls('robotic-rotate')} {
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

            .${cls('robotic-arm1')} {
              transform-origin: 300px 200px;
              animation: ${cls('robotic-rotate')} 23s ease-in-out infinite;
            }

            .${cls('robotic-arm2')} {
              transform-origin: 400px 200px;
              animation: ${cls('robotic-rotate')} 17s ease-in-out infinite;
            }

            .${cls('robotic-arm3')} {
              transform-origin: 490px 200px;
              animation: ${cls('robotic-rotate')} 11s ease-in-out infinite;
            }
            ` : ''}
          `}
        </style>

        <g className={cls('robotic-arm')}>
          <line className={cls('robotic-arm-segment')} x1="250" y1="250" x2="300" y2="250" />
          <circle className={cls('robotic-arm-joint')} cx="250" cy="250" r="64" />
          <g className={cls('robotic-arm1')}>
            <line className={cls('robotic-arm-segment')} x1="300" y1="250" x2="400" y2="250" />
            <circle className={cls('robotic-arm-joint')} cx="300" cy="250" r="30" />
            <g className={cls('robotic-arm2')}>
              <line className={cls('robotic-arm-segment')} x1="400" y1="250" x2="490" y2="250" />
              <circle className={cls('robotic-arm-joint')} cx="400" cy="250" r="24" />
              <g className={cls('robotic-arm3')}>
                <line className={cls('robotic-arm-segment')} x1="490" y1="250" x2="550" y2="250" />
                <circle className={cls('robotic-arm-joint')} cx="490" cy="250" r="16" />
              </g>
            </g>
            <g className={cls('robotic-arm1')}>
              <line className={cls('robotic-arm-segment')} x1="300" y1="250" x2="400" y2="250" />
              <circle className={cls('robotic-arm-joint')} cx="300" cy="250" r="30" />
              <g className={cls('robotic-arm2')}>
                <line className={cls('robotic-arm-segment')} x1="400" y1="250" x2="490" y2="250" />
                <circle className={cls('robotic-arm-joint')} cx="400" cy="250" r="8" />
                <g className={cls('robotic-arm3')}>
                  <line className={cls('robotic-arm-segment')} x1="490" y1="250" x2="550" y2="250" />
                  <circle className={cls('robotic-arm-joint')} cx="490" cy="250" r="8" />
                </g>
                <g className={cls('robotic-arm2')}>
                  <line className={cls('robotic-arm-segment')} x1="400" y1="250" x2="490" y2="250" />
                  <circle className={cls('robotic-arm-joint')} cx="400" cy="250" r="8" />
                  <g className={cls('robotic-arm3')}>
                    <line className={cls('robotic-arm-segment')} x1="490" y1="250" x2="550" y2="250" />
                    <circle className={cls('robotic-arm-joint')} cx="490" cy="250" r="8" />
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>

        <g id={mirId} className={cls('robotic-arm')}>
          <line className={cls('robotic-arm-segment')} x1="250" y1="250" x2="300" y2="250" />
          <circle className={cls('robotic-arm-joint')} cx="250" cy="250" r="64" />
          <g className={cls('robotic-arm1')}>
            <line className={cls('robotic-arm-segment')} x1="300" y1="250" x2="400" y2="250" />
            <circle className={cls('robotic-arm-joint')} cx="300" cy="250" r="30" />
            <g className={cls('robotic-arm2')}>
              <line className={cls('robotic-arm-segment')} x1="400" y1="250" x2="490" y2="250" />
              <circle className={cls('robotic-arm-joint')} cx="400" cy="250" r="24" />
              <g className={cls('robotic-arm3')}>
                <line className={cls('robotic-arm-segment')} x1="490" y1="250" x2="550" y2="250" />
                <circle className={cls('robotic-arm-joint')} cx="490" cy="250" r="16" />
              </g>
            </g>
            <g className={cls('robotic-arm1')}>
              <line className={cls('robotic-arm-segment')} x1="300" y1="250" x2="400" y2="250" />
              <circle className={cls('robotic-arm-joint')} cx="300" cy="250" r="30" />
              <g className={cls('robotic-arm2')}>
                <line className={cls('robotic-arm-segment')} x1="400" y1="250" x2="490" y2="250" />
                <circle className={cls('robotic-arm-joint')} cx="400" cy="250" r="8" />
                <g className={cls('robotic-arm3')}>
                  <line className={cls('robotic-arm-segment')} x1="490" y1="250" x2="550" y2="250" />
                  <circle className={cls('robotic-arm-joint')} cx="490" cy="250" r="8" />
                </g>
                <g className={cls('robotic-arm2')}>
                  <line className={cls('robotic-arm-segment')} x1="400" y1="250" x2="490" y2="250" />
                  <circle className={cls('robotic-arm-joint')} cx="400" cy="250" r="8" />
                  <g className={cls('robotic-arm3')}>
                    <line className={cls('robotic-arm-segment')} x1="490" y1="250" x2="550" y2="250" />
                    <circle className={cls('robotic-arm-joint')} cx="490" cy="250" r="8" />
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
