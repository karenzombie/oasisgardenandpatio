export default function Slide06AdminSite() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#F8F4EF', fontFamily: 'var(--font-body-family)' }}>
      <div className="absolute top-0 inset-x-0" style={{ height: '0.5vh', background: '#1A3C5E' }}></div>

      <div className="absolute inset-0 flex">
        {/* LEFT */}
        <div style={{ width: '40vw', padding: '6vh 3.5vw 6vh 5vw', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.5vh' }}>Admin · Site</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '3.8vw', fontWeight: 700, color: '#1A3C5E', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '2.5vh', textWrap: 'balance' }}>Site Content</div>
          <div style={{ fontSize: '1.7vw', color: '#455064', lineHeight: 1.5, marginBottom: '3.5vh', textWrap: 'pretty' }}>
            Control the public-facing content and legal documentation presented to customers.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2vh' }}>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>Banners</strong> — create and schedule promotional banners site-wide, with optional links, expiry dates, and color customization</div>
            </div>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>Legal</strong> — maintain privacy policy, terms of service, and other required disclosures with full version history</div>
            </div>
          </div>
        </div>

        {/* RIGHT: mockup — Banners page */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh 4vw 5vh 1.5vw' }}>
          <div style={{ width: '100%', height: '82%', borderRadius: '1vh', overflow: 'hidden', boxShadow: '0 2vh 5vh rgba(26,60,94,0.18)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '3.2vh', background: '#E8ECF0', display: 'flex', alignItems: 'center', padding: '0 1.2vh', gap: '0.6vh', flexShrink: 0 }}>
              <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: '#FC6058' }}></div>
              <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: '#FEC02F' }}></div>
              <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: '#2ACA44' }}></div>
              <div style={{ flex: 1, height: '1.5vh', background: '#D0D5DB', borderRadius: '0.3vh', marginLeft: '0.8vh' }}></div>
            </div>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Sidebar */}
              <div style={{ width: '22%', background: '#1A3C5E', padding: '1vh 0', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ margin: '0 0.6vh 0.8vh', background: 'white', borderRadius: '0.3vh', height: '2.2vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '55%', height: '0.7vh', background: '#1A3C5E', borderRadius: '0.15vh' }}></div>
                </div>
                <div style={{ padding: '0.3vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '50%', background: 'rgba(255,255,255,0.28)', borderRadius: '0.1vh' }}></div></div>
                {[60,72].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.1)', width: `${w}%` }}></div>))}
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '38%', background: 'rgba(255,255,255,0.28)', borderRadius: '0.1vh' }}></div></div>
                {[65,58,72,68,60,55].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.1)', width: `${w}%` }}></div>))}
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '44%', background: 'rgba(255,255,255,0.28)', borderRadius: '0.1vh' }}></div></div>
                {[70,62,55,68,75,58].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.1)', width: `${w}%` }}></div>))}
                {/* SITE - active */}
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '30%', background: 'rgba(255,255,255,0.5)', borderRadius: '0.1vh' }}></div></div>
                <div style={{ margin: '0.12vh 0.35vh', height: '1.3vh', borderRadius: '0.2vh', background: 'rgba(255,255,255,0.88)', display: 'flex', alignItems: 'center', paddingLeft: '0.4vh' }}>
                  <div style={{ height: '0.5vh', width: '58%', background: '#1A3C5E', borderRadius: '0.1vh' }}></div>
                </div>
                <div style={{ margin: '0.12vh 0.35vh', height: '1.3vh', borderRadius: '0.2vh', background: 'rgba(255,255,255,0.25)', width: '50%' }}></div>
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '42%', background: 'rgba(255,255,255,0.28)', borderRadius: '0.1vh' }}></div></div>
                {[68,55,72,60,65].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.1)', width: `${w}%` }}></div>))}
              </div>
              {/* Content - Banners */}
              <div style={{ flex: 1, background: '#F5F7FA', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ height: '4.5vh', background: '#1A3C5E', flexShrink: 0 }}></div>
                <div style={{ background: 'white', padding: '1vh 1.5vh', borderBottom: '1px solid #E2E8F0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ height: '1.6vh', width: '22%', background: '#1E293B', borderRadius: '0.25vh', opacity: 0.75 }}></div>
                  <div style={{ height: '2.2vh', width: '22%', background: '#1A3C5E', borderRadius: '0.35vh', opacity: 0.85 }}></div>
                </div>
                <div style={{ flex: 1, padding: '1.2vh 1.5vh', display: 'flex', flexDirection: 'column', gap: '0.8vh', overflow: 'hidden' }}>
                  {/* Banner rows */}
                  {[['#1A3C5E','#DCFCE7',70],['#C4873C','#FEF3C7',55],['#2D6A4F','#F1F5F9',62]].map(([swatch,badgeBg,tw],i) => (
                    <div key={i} style={{ background: 'white', borderRadius: '0.5vh', padding: '1.2vh 1.2vh', boxShadow: '0 0.15vh 0.6vh rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '1vh' }}>
                      <div style={{ width: '3vh', height: '3vh', borderRadius: '0.3vh', background: swatch as string, flexShrink: 0, opacity: 0.85 }}></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: '0.8vh', width: `${tw}%`, background: '#334155', borderRadius: '0.15vh', marginBottom: '0.5vh', opacity: 0.65 }}></div>
                        <div style={{ height: '0.6vh', width: '45%', background: '#94A3B8', borderRadius: '0.1vh', opacity: 0.6 }}></div>
                      </div>
                      <div style={{ height: '1.8vh', width: '14%', background: badgeBg as string, borderRadius: '0.8vh', flexShrink: 0 }}></div>
                      <div style={{ display: 'flex', gap: '0.5vh', flexShrink: 0 }}>
                        <div style={{ width: '2.2vh', height: '2.2vh', background: '#F1F5F9', borderRadius: '0.3vh' }}></div>
                        <div style={{ width: '2.2vh', height: '2.2vh', background: '#FEE2E2', borderRadius: '0.3vh' }}></div>
                      </div>
                    </div>
                  ))}
                  {/* Skeleton row */}
                  <div style={{ background: 'white', borderRadius: '0.5vh', padding: '1.2vh 1.2vh', boxShadow: '0 0.15vh 0.6vh rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '1vh', opacity: 0.4 }}>
                    <div style={{ width: '3vh', height: '3vh', borderRadius: '0.3vh', background: '#E2E8F0', flexShrink: 0 }}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: '0.8vh', width: '40%', background: '#CBD5E1', borderRadius: '0.15vh', marginBottom: '0.5vh' }}></div>
                      <div style={{ height: '0.6vh', width: '28%', background: '#CBD5E1', borderRadius: '0.1vh' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
