type DiagramProps = { className?: string };

const STROKE = "#222222";
const LABEL = "#1f4530";
const DASH = "5 4";
const ARROW = "#222222";

function L({
  x,
  y,
  children,
  italic = true,
}: {
  x: number;
  y: number;
  children: string;
  italic?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={13}
      fontStyle={italic ? "italic" : "normal"}
      fontWeight={600}
      fill={LABEL}
      fontFamily="Georgia, 'Times New Roman', serif"
      textAnchor="middle"
    >
      {children}
    </text>
  );
}

function defs(id: string) {
  return (
    <defs>
      <marker
        id={`arr-${id}`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={ARROW} />
      </marker>
    </defs>
  );
}

function svgProps(className: string | undefined, viewBox = "0 0 240 220") {
  return {
    viewBox,
    xmlns: "http://www.w3.org/2000/svg",
    className: className ?? "w-full h-auto max-w-[240px]",
  } as const;
}

function arr(id: string) {
  return {
    stroke: ARROW,
    strokeWidth: 1.2,
    fill: "none",
    markerEnd: `url(#arr-${id})`,
    markerStart: `url(#arr-${id})`,
  } as const;
}

const SOLID = { stroke: STROKE, strokeWidth: 2, fill: "none" } as const;
const DASHED = {
  stroke: STROKE,
  strokeWidth: 1.5,
  fill: "none",
  strokeDasharray: DASH,
} as const;

// ------------------------------------------------------------------
// Hinged Chaise / Chair — small upright back/head + long flat leg.
// L-shape with dashed underside.
// ------------------------------------------------------------------
export function HingedChaiseDiagram({ className }: DiagramProps) {
  const id = "hc";
  return (
    <svg {...svgProps(className)}>
      {defs(id)}
      {/* Back/head (top, smaller) */}
      <path d="M 60 30 L 130 30 L 130 95 L 60 95 Z" {...SOLID} />
      {/* Leg (extends down from back, longer) */}
      <path d="M 60 95 L 130 95 L 130 200 L 60 200 Z" {...SOLID} />
      {/* Hinge line */}
      <line x1={60} y1={95} x2={130} y2={95} {...DASHED} />
      {/* Underside / depth outline (offset down-right with dashed lines) */}
      <path
        d="M 75 40 L 145 40 L 145 105 M 145 105 L 145 210 L 75 210"
        {...DASHED}
      />
      <line x1={60} y1={30} x2={75} y2={40} {...DASHED} />
      <line x1={130} y1={30} x2={145} y2={40} {...DASHED} />
      <line x1={60} y1={200} x2={75} y2={210} {...DASHED} />

      {/* Labels */}
      {/* a — top width */}
      <line x1={62} y1={20} x2={128} y2={20} {...arr(id)} />
      <L x={95} y={15}>a</L>
      {/* b — right side full height */}
      <line x1={155} y1={42} x2={155} y2={208} {...arr(id)} />
      <L x={167} y={130}>b</L>
      {/* c — leg right side */}
      <line x1={140} y1={108} x2={140} y2={198} {...arr(id)} />
      <L x={123} y={155}>c</L>
      {/* e — left side back height */}
      <line x1={50} y1={32} x2={50} y2={93} {...arr(id)} />
      <L x={42} y={67}>e</L>
      {/* f — depth at top */}
      <line x1={62} y1={28} x2={77} y2={38} {...arr(id)} />
      <L x={64} y={42}>f</L>
      {/* d — bottom width (dashed underside) */}
      <line x1={62} y1={216} x2={128} y2={216} {...arr(id)} />
      <L x={95} y={228}>d</L>
    </svg>
  );
}

// ------------------------------------------------------------------
// Club Chair — vertical back cushion plus a seat cushion in front.
// Two stacked rectangles, lower one extending forward.
// ------------------------------------------------------------------
export function ClubChairDiagram({ className }: DiagramProps) {
  const id = "cc";
  return (
    <svg {...svgProps(className)}>
      {defs(id)}
      {/* Back cushion (upright, narrower top) */}
      <path d="M 70 30 L 145 30 L 145 110 L 70 110 Z" {...SOLID} />
      {/* Back depth */}
      <path d="M 85 40 L 160 40 L 160 120 L 145 110" {...DASHED} />
      <line x1={70} y1={30} x2={85} y2={40} {...DASHED} />
      <line x1={145} y1={30} x2={160} y2={40} {...DASHED} />
      {/* Seat cushion (in front, lower) */}
      <path d="M 60 130 L 155 130 L 155 200 L 60 200 Z" {...SOLID} />
      {/* Seat depth */}
      <path d="M 75 140 L 170 140 L 170 210 L 155 200" {...DASHED} />
      <line x1={60} y1={130} x2={75} y2={140} {...DASHED} />
      <line x1={155} y1={130} x2={170} y2={140} {...DASHED} />
      <line x1={60} y1={200} x2={75} y2={210} {...DASHED} />

      {/* Labels */}
      {/* a — back top width */}
      <line x1={72} y1={22} x2={143} y2={22} {...arr(id)} />
      <L x={107} y={17}>a</L>
      {/* b — back right side */}
      <line x1={172} y1={42} x2={172} y2={118} {...arr(id)} />
      <L x={183} y={82}>b</L>
      {/* c — back depth */}
      <line x1={147} y1={32} x2={162} y2={42} {...arr(id)} />
      <L x={150} y={45}>c</L>
      {/* d — seat top width */}
      <line x1={62} y1={122} x2={153} y2={122} {...arr(id)} />
      <L x={107} y={117}>d</L>
      {/* e — seat right side */}
      <line x1={182} y1={142} x2={182} y2={208} {...arr(id)} />
      <L x={193} y={178}>e</L>
      {/* f — seat depth */}
      <line x1={155} y1={132} x2={170} y2={142} {...arr(id)} />
      <L x={158} y={144}>f</L>
    </svg>
  );
}

// ------------------------------------------------------------------
// Trapezoid Seat — wider at top, narrower at bottom, with depth arrow.
// ------------------------------------------------------------------
export function TrapezoidDiagram({ className }: DiagramProps) {
  const id = "tr";
  return (
    <svg {...svgProps(className)}>
      {defs(id)}
      {/* Trapezoid */}
      <path d="M 35 50 L 205 50 L 165 175 L 75 175 Z" {...SOLID} />
      {/* Underside (offset) */}
      <path
        d="M 50 60 L 220 60 L 180 185 L 90 185 Z"
        {...DASHED}
      />
      <line x1={35} y1={50} x2={50} y2={60} {...DASHED} />
      <line x1={205} y1={50} x2={220} y2={60} {...DASHED} />
      <line x1={75} y1={175} x2={90} y2={185} {...DASHED} />
      <line x1={165} y1={175} x2={180} y2={185} {...DASHED} />

      {/* Labels */}
      {/* a — top width */}
      <line x1={37} y1={42} x2={203} y2={42} {...arr(id)} />
      <L x={120} y={36}>a</L>
      {/* b — right slanted side */}
      <line x1={213} y1={55} x2={173} y2={172} {...arr(id)} />
      <L x={205} y={120}>b</L>
      {/* d — bottom width */}
      <line x1={77} y1={188} x2={163} y2={188} {...arr(id)} />
      <L x={120} y={203}>d</L>
      {/* e — depth diagonal inside (slanted up-left to down-right) */}
      <line x1={120} y1={58} x2={120} y2={170} {...arr(id)} />
      <L x={108} y={120}>e</L>
    </svg>
  );
}

// ------------------------------------------------------------------
// Bench — wide flat rectangle with depth.
// ------------------------------------------------------------------
export function BenchDiagram({ className }: DiagramProps) {
  const id = "bn";
  return (
    <svg {...svgProps(className, "0 0 280 180")}>
      {defs(id)}
      {/* Top */}
      <path d="M 30 50 L 245 50 L 245 130 L 30 130 Z" {...SOLID} />
      {/* Underside */}
      <path
        d="M 45 60 L 260 60 L 260 140 L 45 140 Z"
        {...DASHED}
      />
      <line x1={30} y1={50} x2={45} y2={60} {...DASHED} />
      <line x1={245} y1={50} x2={260} y2={60} {...DASHED} />
      <line x1={30} y1={130} x2={45} y2={140} {...DASHED} />
      <line x1={245} y1={130} x2={260} y2={140} {...DASHED} />

      {/* a — top width */}
      <line x1={32} y1={42} x2={243} y2={42} {...arr(id)} />
      <L x={138} y={36}>a</L>
      {/* b — right side */}
      <line x1={272} y1={62} x2={272} y2={138} {...arr(id)} />
      <L x={262} y={102}>b</L>
      {/* e — interior depth (vertical inside) */}
      <line x1={138} y1={58} x2={138} y2={128} {...arr(id)} />
      <L x={150} y={94}>e</L>
    </svg>
  );
}

// ------------------------------------------------------------------
// Ottoman — small square cushion with rounded dashed underside.
// ------------------------------------------------------------------
export function OttomanDiagram({ className }: DiagramProps) {
  const id = "ot";
  return (
    <svg {...svgProps(className)}>
      {defs(id)}
      {/* Top square */}
      <path d="M 60 50 L 175 50 L 175 160 L 60 160 Z" {...SOLID} />
      {/* Rounded dashed underside */}
      <path
        d="M 75 65 Q 75 178 117 178 Q 190 178 190 70 Q 190 60 175 60"
        {...DASHED}
      />
      <line x1={60} y1={50} x2={75} y2={65} {...DASHED} />
      <line x1={175} y1={50} x2={190} y2={65} {...DASHED} />

      {/* a — top width */}
      <line x1={62} y1={42} x2={173} y2={42} {...arr(id)} />
      <L x={117} y={36}>a</L>
      {/* b — right side */}
      <line x1={203} y1={62} x2={203} y2={158} {...arr(id)} />
      <L x={213} y={114}>b</L>
      {/* e — interior depth */}
      <line x1={117} y1={58} x2={117} y2={158} {...arr(id)} />
      <L x={129} y={114}>e</L>
    </svg>
  );
}

// ------------------------------------------------------------------
// Dining Chair — square with rounded dashed bottom (like ottoman but
// slightly different proportions).
// ------------------------------------------------------------------
export function DiningChairDiagram({ className }: DiagramProps) {
  const id = "dc";
  return (
    <svg {...svgProps(className)}>
      {defs(id)}
      {/* Top square */}
      <path d="M 65 45 L 175 45 L 175 165 L 65 165 Z" {...SOLID} />
      {/* Rounded dashed bottom */}
      <path
        d="M 75 175 Q 120 195 165 175"
        {...DASHED}
      />
      <line x1={65} y1={165} x2={75} y2={175} {...DASHED} />
      <line x1={175} y1={165} x2={165} y2={175} {...DASHED} />

      {/* a — top width */}
      <line x1={67} y1={37} x2={173} y2={37} {...arr(id)} />
      <L x={120} y={31}>a</L>
      {/* b — right side */}
      <line x1={195} y1={47} x2={195} y2={163} {...arr(id)} />
      <L x={205} y={108}>b</L>
      {/* e — interior depth */}
      <line x1={120} y1={53} x2={120} y2={158} {...arr(id)} />
      <L x={132} y={108}>e</L>
    </svg>
  );
}

