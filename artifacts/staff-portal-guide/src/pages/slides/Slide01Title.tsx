export default function Slide01Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#1A3C5E', fontFamily: 'var(--font-body-family)' }}>
      {/* Subtle radial depth */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(255,255,255,0.04) 0%, transparent 65%)' }}></div>

      {/* Decorative circles top-right */}
      <div className="absolute" style={{ right: '-8vw', top: '-8vw', width: '42vw', height: '42vw', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)' }}></div>
      <div className="absolute" style={{ right: '-4vw', top: '-4vw', width: '28vw', height: '28vw', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)' }}></div>

      {/* Gold top accent bar */}
      <div className="absolute top-0 inset-x-0" style={{ height: '0.6vh', background: '#C4873C' }}></div>

      {/* Main content — left-aligned, vertically centered */}
      <div className="absolute inset-0 flex flex-col justify-center" style={{ padding: '0 0 0 8vw' }}>
        {/* Brand label */}
        <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '3vh', fontFamily: 'var(--font-body-family)' }}>
          Oasis Garden &amp; Patio
        </div>

        {/* Hero title */}
        <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '8vw', fontWeight: 700, color: 'white', lineHeight: 0.92, letterSpacing: '-0.025em', marginBottom: '3.5vh', textWrap: 'balance' }}>
          Staff Portal
        </div>

        {/* Gold rule */}
        <div style={{ width: '7vw', height: '0.45vh', background: '#C4873C', marginBottom: '3.5vh' }}></div>

        {/* Subtitle */}
        <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '2.2vw', color: 'rgba(255,255,255,0.72)', fontStyle: 'italic', fontWeight: 400, maxWidth: '40vw', lineHeight: 1.4, textWrap: 'balance' }}>
          Admin &amp; Sales Agent Reference Guide
        </div>
      </div>

      {/* Bottom label */}
      <div className="absolute" style={{ bottom: '5vh', left: '8vw', fontSize: '1.5vw', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', fontFamily: 'var(--font-body-family)' }}>
        2026 · Internal Reference
      </div>

      {/* Right decorative portal frame sketch */}
      <div className="absolute" style={{ right: '6vw', top: '50%', transform: 'translateY(-50%)', width: '28vw', height: '38vh', borderRadius: '1vh', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: '3vh', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 1.2vh', gap: '0.6vh', flexShrink: 0 }}>
          <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }}></div>
          <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }}></div>
          <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }}></div>
          <div style={{ flex: 1, height: '1.2vh', background: 'rgba(255,255,255,0.1)', borderRadius: '0.3vh', marginLeft: '0.8vh' }}></div>
        </div>
        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ width: '28%', background: 'rgba(255,255,255,0.08)', padding: '1vh 0', display: 'flex', flexDirection: 'column', gap: '0.5vh' }}>
            {[55, 70, 60, 65, 50, 75, 55, 62, 58, 68, 52, 64, 48, 72, 56].map((w, i) => (
              <div key={i} style={{ margin: '0 0.5vh', height: '1.1vh', borderRadius: '0.2vh', background: i === 0 ? 'rgba(196,135,60,0.6)' : 'rgba(255,255,255,0.1)', width: `${w}%` }}></div>
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '4vh', background: 'rgba(255,255,255,0.06)' }}></div>
            <div style={{ flex: 1, padding: '1vh', display: 'flex', flexDirection: 'column', gap: '0.8vh' }}>
              <div style={{ display: 'flex', gap: '0.6vh' }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{ flex: 1, height: '5vh', background: 'rgba(255,255,255,0.08)', borderRadius: '0.4vh' }}></div>
                ))}
              </div>
              {[1,2,3].map(i => (
                <div key={i} style={{ height: '2vh', background: 'rgba(255,255,255,0.06)', borderRadius: '0.3vh' }}></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
