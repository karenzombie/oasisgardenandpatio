export default function Slide03AdminOverview() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#F8F4EF', fontFamily: 'var(--font-body-family)' }}>
      <div className="absolute top-0 inset-x-0" style={{ height: '0.5vh', background: '#1A3C5E' }}></div>

      <div className="absolute inset-0 flex">
        {/* LEFT */}
        <div style={{ width: '40vw', padding: '7vh 3.5vw 7vh 5vw', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.5vh' }}>Admin · Overview</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '3.8vw', fontWeight: 700, color: '#1A3C5E', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '2.5vh', textWrap: 'balance' }}>Dashboard &amp; Notifications</div>
          <div style={{ fontSize: '1.7vw', color: '#455064', lineHeight: 1.55, marginBottom: '3.5vh', textWrap: 'pretty' }}>
            The starting point for every admin session — live metrics, alerts, and a notification feed.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8vh' }}>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>Dashboard</strong> — revenue totals, open order count, low-stock alerts, and vendor order status at a glance</div>
            </div>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>Notifications</strong> — staff event feed with mark-as-read; tracks activity across orders, users, and system changes</div>
            </div>
          </div>
        </div>

        {/* RIGHT: real screenshot */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh 4vw 5vh 1.5vw' }}>
          <img
            src={import.meta.env.BASE_URL + 'slide3.png'}
            alt="Admin Dashboard screenshot"
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
