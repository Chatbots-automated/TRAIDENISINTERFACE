import React from 'react';

interface BanterLoaderProps {
  size?: 'small' | 'medium' | 'large';
}

export default function BanterLoader({ size = 'medium' }: BanterLoaderProps) {
  const dimensions = {
    small: { container: 48, box: 13, gap: 4, margin: -24, borderRadius: 4 },
    medium: { container: 72, box: 20, gap: 6, margin: -36, borderRadius: 6 },
    large: { container: 96, box: 27, gap: 8, margin: -48, borderRadius: 8 }
  };

  const d = dimensions[size];
  const moveDistance = d.box + d.gap;

  return (
    <div
      style={{
        position: 'relative',
        width: `${d.container}px`,
        height: `${d.container}px`,
        margin: '0 auto'
      }}
    >
      <style>{`
        @keyframes banterMoveBox-1 {
          9.0909090909% { transform: translate(-${moveDistance}px, 0); }
          18.1818181818% { transform: translate(0px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(${moveDistance}px, 0); }
          45.4545454545% { transform: translate(${moveDistance}px, ${moveDistance}px); }
          54.5454545455% { transform: translate(${moveDistance}px, ${moveDistance}px); }
          63.6363636364% { transform: translate(${moveDistance}px, ${moveDistance}px); }
          72.7272727273% { transform: translate(${moveDistance}px, 0px); }
          81.8181818182% { transform: translate(0px, 0px); }
          90.9090909091% { transform: translate(-${moveDistance}px, 0px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-2 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(${moveDistance}px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(${moveDistance}px, 0); }
          45.4545454545% { transform: translate(${moveDistance}px, ${moveDistance}px); }
          54.5454545455% { transform: translate(${moveDistance}px, ${moveDistance}px); }
          63.6363636364% { transform: translate(${moveDistance}px, ${moveDistance}px); }
          72.7272727273% { transform: translate(${moveDistance}px, ${moveDistance}px); }
          81.8181818182% { transform: translate(0px, ${moveDistance}px); }
          90.9090909091% { transform: translate(0px, ${moveDistance}px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-3 {
          9.0909090909% { transform: translate(-${moveDistance}px, 0); }
          18.1818181818% { transform: translate(-${moveDistance}px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(-${moveDistance}px, 0); }
          45.4545454545% { transform: translate(-${moveDistance}px, 0); }
          54.5454545455% { transform: translate(-${moveDistance}px, 0); }
          63.6363636364% { transform: translate(-${moveDistance}px, 0); }
          72.7272727273% { transform: translate(-${moveDistance}px, 0); }
          81.8181818182% { transform: translate(-${moveDistance}px, -${moveDistance}px); }
          90.9090909091% { transform: translate(0px, -${moveDistance}px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-4 {
          9.0909090909% { transform: translate(-${moveDistance}px, 0); }
          18.1818181818% { transform: translate(-${moveDistance}px, 0); }
          27.2727272727% { transform: translate(-${moveDistance}px, -${moveDistance}px); }
          36.3636363636% { transform: translate(0px, -${moveDistance}px); }
          45.4545454545% { transform: translate(0px, 0px); }
          54.5454545455% { transform: translate(0px, -${moveDistance}px); }
          63.6363636364% { transform: translate(0px, -${moveDistance}px); }
          72.7272727273% { transform: translate(0px, -${moveDistance}px); }
          81.8181818182% { transform: translate(-${moveDistance}px, -${moveDistance}px); }
          90.9090909091% { transform: translate(-${moveDistance}px, 0px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-5 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(0, 0); }
          27.2727272727% { transform: translate(0, 0); }
          36.3636363636% { transform: translate(${moveDistance}px, 0); }
          45.4545454545% { transform: translate(${moveDistance}px, 0); }
          54.5454545455% { transform: translate(${moveDistance}px, 0); }
          63.6363636364% { transform: translate(${moveDistance}px, 0); }
          72.7272727273% { transform: translate(${moveDistance}px, 0); }
          81.8181818182% { transform: translate(${moveDistance}px, -${moveDistance}px); }
          90.9090909091% { transform: translate(0px, -${moveDistance}px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-6 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(-${moveDistance}px, 0); }
          27.2727272727% { transform: translate(-${moveDistance}px, 0); }
          36.3636363636% { transform: translate(0px, 0); }
          45.4545454545% { transform: translate(0px, 0); }
          54.5454545455% { transform: translate(0px, 0); }
          63.6363636364% { transform: translate(0px, 0); }
          72.7272727273% { transform: translate(0px, ${moveDistance}px); }
          81.8181818182% { transform: translate(-${moveDistance}px, ${moveDistance}px); }
          90.9090909091% { transform: translate(-${moveDistance}px, 0px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-7 {
          9.0909090909% { transform: translate(${moveDistance}px, 0); }
          18.1818181818% { transform: translate(${moveDistance}px, 0); }
          27.2727272727% { transform: translate(${moveDistance}px, 0); }
          36.3636363636% { transform: translate(0px, 0); }
          45.4545454545% { transform: translate(0px, -${moveDistance}px); }
          54.5454545455% { transform: translate(${moveDistance}px, -${moveDistance}px); }
          63.6363636364% { transform: translate(0px, -${moveDistance}px); }
          72.7272727273% { transform: translate(0px, -${moveDistance}px); }
          81.8181818182% { transform: translate(0px, 0px); }
          90.9090909091% { transform: translate(${moveDistance}px, 0px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-8 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(-${moveDistance}px, 0); }
          27.2727272727% { transform: translate(-${moveDistance}px, -${moveDistance}px); }
          36.3636363636% { transform: translate(0px, -${moveDistance}px); }
          45.4545454545% { transform: translate(0px, -${moveDistance}px); }
          54.5454545455% { transform: translate(0px, -${moveDistance}px); }
          63.6363636364% { transform: translate(0px, -${moveDistance}px); }
          72.7272727273% { transform: translate(0px, -${moveDistance}px); }
          81.8181818182% { transform: translate(${moveDistance}px, -${moveDistance}px); }
          90.9090909091% { transform: translate(${moveDistance}px, 0px); }
          100% { transform: translate(0px, 0px); }
        }
        @keyframes banterMoveBox-9 {
          9.0909090909% { transform: translate(-${moveDistance}px, 0); }
          18.1818181818% { transform: translate(-${moveDistance}px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(-${moveDistance}px, 0); }
          45.4545454545% { transform: translate(0px, 0); }
          54.5454545455% { transform: translate(0px, 0); }
          63.6363636364% { transform: translate(-${moveDistance}px, 0); }
          72.7272727273% { transform: translate(-${moveDistance}px, 0); }
          81.8181818182% { transform: translate(-${moveDistance * 2}px, 0); }
          90.9090909091% { transform: translate(-${moveDistance}px, 0); }
          100% { transform: translate(0px, 0); }
        }
      `}</style>

      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
        <div
          key={num}
          style={{
            float: 'left',
            position: 'relative',
            width: `${d.box}px`,
            height: `${d.box}px`,
            marginRight: num % 3 === 0 ? '0' : `${d.gap}px`,
            marginBottom: num % 3 === 0 ? `${d.gap}px` : '0',
            animation: `banterMoveBox-${num} 6s infinite`
          }}
        >
          <div
            style={{
              content: '""',
              position: 'absolute',
              left: num === 1 || num === 4 ? `${moveDistance}px` : num === 3 ? '0' : '0',
              top: num === 3 ? `${moveDistance * 2}px` : '0',
              width: '100%',
              height: '100%',
              background: 'rgb(81, 228, 220)',
              borderRadius: `${d.borderRadius}px`,
              transform: 'rotate(45deg)',
              opacity: 0.7
            }}
          />
        </div>
      ))}
    </div>
  );
}
