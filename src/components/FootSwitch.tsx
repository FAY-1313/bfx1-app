interface FootSwitchProps {
  on?: boolean;
  size?: number;
  accentColor?: string;
  onToggle?: () => void;
}

export default function FootSwitch({
  on = false,
  size = 44,
  accentColor = '#F06F21',
  onToggle = () => {},
}: FootSwitchProps) {
  return (
    <div
      data-cmp="FootSwitch"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}
    >
      {/* Round footswitch button */}
      <div
        onClick={onToggle}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          position: 'relative',
          cursor: 'pointer',
          background: on
            ? `radial-gradient(circle at 38% 30%, ${accentColor}, ${accentColor} 40%, #8a4a1a 100%)`
            : 'radial-gradient(circle at 38% 30%, #3a3c42, #232428 55%, #2d2e34 100%)',
          border: `1px solid ${on ? 'rgba(255,255,255,0.5)' : '#3f4045'}`,
          boxShadow: on
            ? `0 0 16px ${accentColor}66, 0 2px 5px rgba(0,0,0,0.55)`
            : '0 2px 5px rgba(0,0,0,0.55), inset 0 1px 2px rgba(0,0,0,0.4)',
          transition: 'all 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Inner cap (depressed look) */}
        <div
          style={{
            position: 'absolute',
            width: size * 0.62,
            height: size * 0.62,
            borderRadius: '50%',
            background: on
              ? `radial-gradient(circle at 38% 30%, ${accentColor}, #b8551b 60%, #7a3c12 100%)`
              : 'radial-gradient(circle at 38% 30%, #4a4c52, #2c2e34 55%, #2d2f33 100%)',
            border: '1px solid rgba(0,0,0,0.45)',
            boxShadow: on
              ? '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.25)'
              : '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.12)',
            transition: 'all 0.15s ease',
          }}
        >
          {/* LED dot */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: size * 0.16,
              height: size * 0.16,
              borderRadius: '50%',
              background: on ? accentColor : '#2e2f33',
              boxShadow: on ? `0 0 8px 2px ${accentColor}` : 'inset 0 1px 2px rgba(0,0,0,0.8)',
              transition: 'all 0.15s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
}
