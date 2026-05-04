export default function Slide08AgentOverview() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: '#F8F4EF', fontFamily: 'var(--font-body-family)' }}>
      <div className="absolute top-0 inset-x-0" style={{ height: '0.5vh', background: '#C4873C' }}></div>

      <div className="absolute inset-0 flex">
        {/* LEFT */}
        <div style={{ width: '40vw', padding: '6vh 3.5vw 6vh 5vw', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5vw', fontWeight: 700, color: '#C4873C', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '1.5vh' }}>Sales Agent · Overview</div>
          <div style={{ fontFamily: 'var(--font-display-family)', fontSize: '3.5vw', fontWeight: 700, color: '#1A3C5E', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '2.5vh', textWrap: 'balance' }}>Sales Agent Portal</div>
          <div style={{ fontSize: '1.7vw', color: '#455064', lineHeight: 1.55, marginBottom: '3.5vh', textWrap: 'pretty' }}>
            A focused workspace for order-facing staff, scoped to the tools needed for day-to-day sales and customer support.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8vh' }}>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}><strong>Dashboard</strong> — live summary of today's orders, open quotes, and quick navigation shortcuts</div>
            </div>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}>Separate login credentials — agents cannot access admin-only sections</div>
            </div>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'flex-start' }}>
              <div style={{ width: '0.45vw', height: '0.45vw', borderRadius: '50%', background: '#C4873C', marginTop: '0.8vh', flexShrink: 0 }}></div>
              <div style={{ fontSize: '1.6vw', color: '#1C2B3A', lineHeight: 1.45 }}>3 focused sections: Overview, Orders, and Reference</div>
            </div>
          </div>
        </div>

        {/* RIGHT: agent portal mockup */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5vh 4vw 5vh 1.5vw' }}>
          <div style={{ width: '100%', height: '82%', borderRadius: '1vh', overflow: 'hidden', boxShadow: '0 2vh 5vh rgba(26,60,94,0.18)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: '3.2vh', background: '#E8ECF0', display: 'flex', alignItems: 'center', padding: '0 1.2vh', gap: '0.6vh', flexShrink: 0 }}>
              <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: '#FC6058' }}></div>
              <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: '#FEC02F' }}></div>
              <div style={{ width: '0.8vh', height: '0.8vh', borderRadius: '50%', background: '#2ACA44' }}></div>
              <div style={{ flex: 1, height: '1.5vh', background: '#D0D5DB', borderRadius: '0.3vh', marginLeft: '0.8vh' }}></div>
            </div>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Agent Sidebar */}
              <div style={{ width: '22%', background: '#1A3C5E', padding: '1vh 0', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ margin: '0 0.6vh 0.8vh', background: 'white', borderRadius: '0.3vh', height: '2.2vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '55%', height: '0.7vh', background: '#1A3C5E', borderRadius: '0.15vh' }}></div>
                </div>
                {/* OVERVIEW - active */}
                <div style={{ padding: '0.3vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '50%', background: 'rgba(255,255,255,0.5)', borderRadius: '0.1vh' }}></div></div>
                <div style={{ margin: '0.15vh 0.35vh', height: '1.3vh', borderRadius: '0.2vh', background: 'rgba(255,255,255,0.88)', display: 'flex', alignItems: 'center', paddingLeft: '0.4vh' }}>
                  <div style={{ height: '0.5vh', width: '62%', background: '#1A3C5E', borderRadius: '0.1vh' }}></div>
                </div>
                {/* ORDERS */}
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '38%', background: 'rgba(255,255,255,0.28)', borderRadius: '0.1vh' }}></div></div>
                {[65,58,70].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.12)', width: `${w}%` }}></div>))}
                {/* REFERENCE */}
                <div style={{ padding: '0.5vh 0.6vh 0.2vh' }}><div style={{ height: '0.4vh', width: '48%', background: 'rgba(255,255,255,0.28)', borderRadius: '0.1vh' }}></div></div>
                {[68,60,55].map((w,i) => (<div key={i} style={{ margin: '0.12vh 0.35vh', height: '1.1vh', borderRadius: '0.18vh', background: 'rgba(255,255,255,0.12)', width: `${w}%` }}></div>))}
              </div>
              {/* Content - Agent Dashboard */}
              <div style={{ flex: 1, background: '#F5F7FA', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ height: '4.5vh', background: '#1A3C5E', flexShrink: 0 }}></div>
                <div style={{ background: 'white', padding: '1vh 1.5vh', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
                  <div style={{ height: '1.6vh', width: '32%', background: '#1E293B', borderRadius: '0.25vh', opacity: 0.75 }}></div>
                </div>
                <div style={{ flex: 1, padding: '1.2vh 1.5vh', overflow: 'hidden' }}>
                  {/* Stat cards */}
                  <div style={{ display: 'flex', gap: '1vh', marginBottom: '1.2vh' }}>
                    {[['#1A3C5E',60],['#C4873C',50],['#1A3C5E',45]].map(([col,w],i) => (
                      <div key={i} style={{ flex: 1, background: 'white', borderRadius: '0.5vh', padding: '1vh', boxShadow: '0 0.15vh 0.6vh rgba(0,0,0,0.06)' }}>
                        <div style={{ height: '0.6vh', width: '60%', background: '#CBD5E1', borderRadius: '0.1vh', marginBottom: '0.7vh' }}></div>
                        <div style={{ height: '2vh', width: `${w}%`, background: col as string, borderRadius: '0.2vh', opacity: 0.85 }}></div>
                      </div>
                    ))}
                  </div>
                  {/* Today's orders list */}
                  <div style={{ background: 'white', borderRadius: '0.5vh', boxShadow: '0 0.15vh 0.6vh rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <div style={{ height: '0.5vh', width: '100%', background: '#C4873C', opacity: 0.4 }}></div>
                    <div style={{ display: 'flex', padding: '0.6vh 1vh', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', gap: '0.7vh', alignItems: 'center' }}>
                      {[12,26,16].map((w,i) => (<div key={i} style={{ height: '0.5vh', width: `${w}%`, background: '#94A3B8', borderRadius: '0.1vh' }}></div>))}
                      <div style={{ height: '0.5vh', width: '14%', background: '#94A3B8', borderRadius: '0.1vh', marginLeft: 'auto' }}></div>
                    </div>
                    {[['#DCFCE7',24],['#FEF3C7',18],['#E0F2FE',28],['#DCFCE7',22]].map(([bg,nw],i) => (
                      <div key={i} style={{ display: 'flex', padding: '0.65vh 1vh', borderBottom: i < 3 ? '1px solid #F1F5F9' : 'none', alignItems: 'center', gap: '0.7vh' }}>
                        <div style={{ height: '0.6vh', width: '12%', background: '#1A3C5E', borderRadius: '0.1vh', opacity: 0.6 }}></div>
                        <div style={{ height: '0.6vh', width: `${nw}%`, background: '#334155', borderRadius: '0.1vh', opacity: 0.5 }}></div>
                        <div style={{ height: '0.6vh', width: '16%', background: '#334155', borderRadius: '0.1vh', opacity: 0.35 }}></div>
                        <div style={{ height: '1.2vh', width: '16%', background: bg as string, borderRadius: '1vh', marginLeft: 'auto' }}></div>
                      </div>
                    ))}
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
