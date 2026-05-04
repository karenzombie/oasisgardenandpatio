export default function Slide11Closing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#1A3C5E', fontFamily: 'var(--font-body-family)' }}>
      {/* Radial depth */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.05) 0%, transparent 60%)' }}></div>

      {/* Decorative circles */}
      <div className="absolute" style={{ left: '-10vw', bottom: '-10vw', width: '50vw', height: '50vw', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)' }}></div>
      <div className="absolute" style={{ left: '-5vw', bottom: '-5vw', width: '35vw', height: '35vw', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)' }}></div>

      {/* Gold bottom accent bar */}
      <div className="absolute bottom-0 inset-x-0" style={{ height: '0.6vh', background: '#C4873C' }}></div>

      {/* Content — right-aligned for visual balance */}
      <div className="absolute inset-0 flex flex-col justify-center items-end" style={{ padding: '0 8vw 0 0' }}>
        <div style={{ textAlign: 'right', maxWidth: '55vw' }}>
          <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '2.5vh' }}>
            Oasis Garden &amp; Patio
          </div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '6vw', fontWeight: 700, color: 'white', lineHeight: 0.95, letterSpacing: '-0.025em', marginBottom: '3vh', textWrap: 'balance' }}>
            Questions?
          </div>
          <div style={{ width: '7vw', height: '0.45vh', background: '#C4873C', marginLeft: 'auto', marginBottom: '3.5vh' }}></div>
          <div style={{ fontSize: '1.8vw', color: 'rgba(255,255,255,0.68)', lineHeight: 1.5, textWrap: 'balance' }}>
            Contact your Admin to request portal access, change your role, or update credentials.
          </div>
        </div>
      </div>

      {/* Left: access paths summary */}
      <div className="absolute" style={{ left: '7vw', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: '2.5vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
          <div style={{ width: '3vw', height: '0.4vh', background: '#C4873C' }}></div>
          <div style={{ fontSize: '1.7vw', color: 'rgba(255,255,255,0.75)', fontFamily: 'var(--font-body-family)' }}>/staff → Sign In</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
          <div style={{ width: '3vw', height: '0.4vh', background: 'rgba(255,255,255,0.25)' }}></div>
          <div style={{ fontSize: '1.7vw', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-body-family)' }}>/admin → Admin Portal</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
          <div style={{ width: '3vw', height: '0.4vh', background: 'rgba(255,255,255,0.25)' }}></div>
          <div style={{ fontSize: '1.7vw', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-body-family)' }}>/agent → Sales Agent Portal</div>
        </div>
      </div>
    </div>
  );
}
