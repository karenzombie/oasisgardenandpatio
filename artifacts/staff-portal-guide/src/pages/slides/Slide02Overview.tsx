export default function Slide02Overview() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#F8F4EF', fontFamily: 'var(--font-body-family)' }}>
      {/* Top accent */}
      <div className="absolute top-0 inset-x-0" style={{ height: '0.5vh', background: '#1A3C5E' }}></div>

      {/* Header */}
      <div className="absolute" style={{ top: '7vh', left: '0', right: '0', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Staff Portal
        </div>
        <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '4vw', fontWeight: 700, color: '#1A3C5E', marginTop: '0.8vh', letterSpacing: '-0.02em' }}>
          Two Portal Roles
        </div>
      </div>

      {/* Two cards */}
      <div className="absolute" style={{ top: '23vh', bottom: '7vh', left: '5vw', right: '5vw', display: 'flex', gap: '2.5vw' }}>
        {/* Admin Portal */}
        <div style={{ flex: 1, background: '#1A3C5E', borderRadius: '1.2vh', padding: '4.5vh 3.5vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: '1.5vw', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '1.2vh' }}>Role</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '3.2vw', color: 'white', fontWeight: 700, marginBottom: '2vh', letterSpacing: '-0.01em' }}>Admin Portal</div>
          <div style={{ fontSize: '1.7vw', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: '3vh', textWrap: 'balance' }}>
            Full platform access for store managers, covering every business function.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#C4873C', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>Overview — Dashboard, Notifications</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#C4873C', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>Sales — Orders, Vendors, Customers, Discounts</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#C4873C', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>Catalog — Products, Sets, Inventory, Carriers</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#C4873C', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>Site — Banners, Legal</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#C4873C', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>System — Reports, Users, Audit, Settings</div>
            </div>
          </div>
        </div>

        {/* Agent Portal */}
        <div style={{ flex: 1, background: 'white', borderRadius: '1.2vh', padding: '4.5vh 3.5vw', display: 'flex', flexDirection: 'column', border: '1.5px solid #E4DDD5', overflow: 'hidden' }}>
          <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '1.2vh' }}>Role</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '3.2vw', color: '#1A3C5E', fontWeight: 700, marginBottom: '2vh', letterSpacing: '-0.01em' }}>Sales Agent</div>
          <div style={{ fontSize: '1.7vw', color: '#6B7A8D', lineHeight: 1.5, marginBottom: '3vh', textWrap: 'balance' }}>
            Focused workspace for order-facing staff. Scoped to sales execution and customer service.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#1A3C5E', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.4 }}>Overview — Dashboard</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#1A3C5E', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.4 }}>Orders — New Order, Orders, Customers</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1vw' }}>
              <div style={{ width: '0.5vw', height: '0.5vw', borderRadius: '50%', background: '#1A3C5E', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.4 }}>Reference — Products, Inventory, Reports</div>
            </div>
          </div>
          {/* Access note */}
          <div style={{ marginTop: 'auto', paddingTop: '3vh', borderTop: '1px solid #EDE8E3', fontSize: '1.5vw', color: '#9AA3AE', lineHeight: 1.4 }}>
            Sign in at /staff · Role assigned by an Admin
          </div>
        </div>
      </div>
    </div>
  );
}
