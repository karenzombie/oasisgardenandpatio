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

        {/* RIGHT: real screenshot */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh 4vw 5vh 1.5vw' }}>
          <img
            src={import.meta.env.BASE_URL + 'slide6.png'}
            alt="Admin Site Banners screenshot"
            style={{
              width: '100%',
              height: '82%',
              objectFit: 'contain',
              objectPosition: 'center',
              borderRadius: '1vh',
              boxShadow: '0 2vh 5vh rgba(26,60,94,0.18)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
