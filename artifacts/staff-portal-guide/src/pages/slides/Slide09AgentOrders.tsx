export default function Slide09AgentOrders() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#F8F4EF', fontFamily: 'var(--font-body-family)' }}>
      <div className="absolute top-0 inset-x-0" style={{ height: '0.5vh', background: '#C4873C' }}></div>

      <div className="absolute inset-0 flex">
        {/* LEFT */}
        <div style={{ width: '40vw', padding: '6vh 3.5vw 6vh 5vw', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.5vh' }}>Agent · Orders</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '3.8vw', fontWeight: 700, color: '#1A3C5E', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '2.5vh', textWrap: 'balance' }}>Order Workflow</div>
          <div style={{ fontSize: '1.7vw', color: '#455064', lineHeight: 1.55, marginBottom: '3.5vh', textWrap: 'pretty' }}>
            The complete order creation and management workflow for sales agents.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8vh' }}>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>New Order</strong> — multi-tab builder for Products, Sets, and Cushions with customer lookup and pricing preview</div>
            </div>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>Orders</strong> — full order list with status filters, search, and one-click detail views</div>
            </div>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>Customers</strong> — look up accounts, contact details, and purchase history</div>
            </div>
          </div>
        </div>

        {/* RIGHT: mockup — New Order page */}
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
                <div style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.12)', width: '62%' }}></div>
                {/* ORDERS - active */}
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '38%', background: 'rgba(255,255,255,0.5)', borderRadius: '0.1vh' }}></div></div>
                <div style={{ margin: '0.15vh 0.35vh', height: '1.3vh', borderRadius: '0.2vh', background: 'rgba(255,255,255,0.88)', display: 'flex', alignItems: 'center', paddingLeft: '0.4vh' }}>
                  <div style={{ height: '0.5vh', width: '65%', background: '#1A3C5E', borderRadius: '0.1vh' }}></div>
                </div>
                {[58,70].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.3vh', borderRadius: '0.2vh', background: 'rgba(255,255,255,0.25)', width: `${w}%` }}></div>))}
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '48%', background: 'rgba(255,255,255,0.28)', borderRadius: '0.1vh' }}></div></div>
                {[68,60,55].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.12)', width: `${w}%` }}></div>))}
              </div>
              {/* Content - New Order */}
              <div style={{ flex: 1, background: '#F5F7FA', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ height: '4.5vh', background: '#1A3C5E', flexShrink: 0 }}></div>
                <div style={{ background: 'white', padding: '1vh 1.5vh', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
                  <div style={{ height: '1.6vh', width: '25%', background: '#1E293B', borderRadius: '0.25vh', opacity: 0.75 }}></div>
                </div>
                <div style={{ flex: 1, padding: '1.2vh 1.5vh', display: 'flex', gap: '1.2vh', overflow: 'hidden' }}>
                  {/* Left: product search */}
                  <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '0.8vh', overflow: 'hidden' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '0', background: 'white', borderRadius: '0.5vh', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                      <div style={{ flex: 1, padding: '0.7vh', background: '#1A3C5E', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ height: '0.7vh', width: '60%', background: 'white', borderRadius: '0.1vh', opacity: 0.8 }}></div>
                      </div>
                      <div style={{ flex: 1, padding: '0.7vh', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ height: '0.7vh', width: '55%', background: '#94A3B8', borderRadius: '0.1vh' }}></div>
                      </div>
                      <div style={{ flex: 1, padding: '0.7vh', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ height: '0.7vh', width: '65%', background: '#94A3B8', borderRadius: '0.1vh' }}></div>
                      </div>
                    </div>
                    {/* Search */}
                    <div style={{ height: '2.2vh', background: 'white', borderRadius: '0.4vh', border: '1px solid #E2E8F0' }}></div>
                    {/* Results */}
                    <div style={{ flex: 1, background: 'white', borderRadius: '0.5vh', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                      {[[4,30,12],[4,25,16],[4,28,14],[4,22,12]].map(([,nw,pw],i) => (
                        <div key={i} style={{ display: 'flex', padding: '0.65vh 0.8vh', borderBottom: i < 3 ? '1px solid #F1F5F9' : 'none', alignItems: 'center', gap: '0.6vh' }}>
                          <div style={{ width: '3.5vh', height: '3.5vh', background: '#E2E8F0', borderRadius: '0.25vh', flexShrink: 0 }}></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ height: '0.7vh', width: `${nw}%`, background: '#334155', borderRadius: '0.1vh', opacity: 0.6, marginBottom: '0.4vh' }}></div>
                            <div style={{ height: '0.5vh', width: '40%', background: '#94A3B8', borderRadius: '0.1vh', opacity: 0.6 }}></div>
                          </div>
                          <div style={{ height: '0.7vh', width: `${pw}%`, background: '#1A3C5E', borderRadius: '0.1vh', opacity: 0.7 }}></div>
                          <div style={{ width: '2vh', height: '2vh', background: '#1A3C5E', borderRadius: '50%', opacity: 0.2, flexShrink: 0 }}></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Right: order summary */}
                  <div style={{ flex: 1, background: 'white', borderRadius: '0.5vh', padding: '0.8vh', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '0.6vh', overflow: 'hidden' }}>
                    <div style={{ height: '0.7vh', width: '55%', background: '#1A3C5E', borderRadius: '0.1vh', opacity: 0.6 }}></div>
                    <div style={{ height: '1px', background: '#E2E8F0' }}></div>
                    {[50,45,38].map((w,i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.4vh', alignItems: 'center' }}>
                        <div style={{ height: '0.6vh', flex: 1, background: '#334155', borderRadius: '0.1vh', opacity: 0.45 }}></div>
                        <div style={{ height: '0.6vh', width: `${w}%`, background: '#1A3C5E', borderRadius: '0.1vh', opacity: 0.5 }}></div>
                      </div>
                    ))}
                    <div style={{ marginTop: 'auto', height: '2.5vh', background: '#1A3C5E', borderRadius: '0.4vh', opacity: 0.85 }}></div>
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
