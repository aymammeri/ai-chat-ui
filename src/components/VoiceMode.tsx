import * as React from 'react';
import { useEffect, useState } from 'react';

// VoiceMode is now a purely visual component. It receives a ref to the current
// sound level (0..1) and animates a circle accordingly. All logic lives in App.
const VoiceMode = ({ levelRef }: { levelRef: React.MutableRefObject<number> }) => {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      // Read the latest level from the ref and ease it a bit for smoother visuals
      const target = Math.max(0, Math.min(1, levelRef.current));
      setLevel((prev) => prev + (target - prev) * 0.2);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  const size = 80 + level * 120; // 80..200 px
  const glow = 10 + level * 30;

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <h3>Listening...</h3>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #60a5fa, #3b82f6)',
          boxShadow: `0 0 ${glow}px rgba(59,130,246,0.7), inset 0 0 ${glow / 2}px rgba(255,255,255,0.4)`,
          transition: 'width 100ms linear, height 100ms linear, box-shadow 100ms linear',
        }}
      />
      <div className="text-xs text-gray-500">Voice circle responds to live input level</div>
    </div>
  );
};

export default VoiceMode;
