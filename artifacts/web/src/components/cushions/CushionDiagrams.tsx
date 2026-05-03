type DiagramProps = { className?: string };

const STROKE = "#333333";
const LABEL = "#2E5D3B";
const HIDDEN = "#888888";

function L({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={12}
      fontWeight={700}
      fill={LABEL}
      fontFamily="Georgia, serif"
      textAnchor="middle"
    >
      {children}
    </text>
  );
}

function defs() {
  return (
    <defs>
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={STROKE} />
      </marker>
    </defs>
  );
}

const baseSvg = "w-full h-auto max-w-[220px]";

function svgProps(className?: string) {
  return {
    viewBox: "0 0 220 200",
    xmlns: "http://www.w3.org/2000/svg",
    className: className ?? baseSvg,
  };
}

const arrowProps = {
  stroke: STROKE,
  strokeWidth: 1,
  markerEnd: "url(#arrow)",
  markerStart: "url(#arrow)",
} as const;

export function HingedChaiseDiagram({ className }: DiagramProps) {
  return (
    <svg {...svgProps(className)}>
      {defs()}
      {/* Seat top face (perspective) */}
      <polygon
        points="40,90 160,90 175,75 55,75"
        fill="#fafafa"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      {/* Seat front face */}
      <polygon
        points="40,90 160,90 160,120 40,120"
        fill="#f5f5f5"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      {/* Back portion (shorter, taller) */}
      <polygon
        points="55,75 100,75 100,30 55,40"
        fill="#fafafa"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      <polygon
        points="100,75 115,60 115,15 100,30"
        fill="#f0f0f0"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      {/* Hinge mark */}
      <line x1={55} y1={75} x2={100} y2={75} stroke={HIDDEN} strokeDasharray="3 3" />
      {/* a — width across top */}
      <line x1={45} y1={138} x2={155} y2={138} {...arrowProps} />
      <L x={100} y={154}>a</L>
      {/* b — back height (right side of back) */}
      <line x1={120} y1={20} x2={120} y2={70} {...arrowProps} />
      <L x={134} y={48}>b</L>
      {/* c — diagonal front-right edge */}
      <line x1={165} y1={92} x2={180} y2={118} {...arrowProps} />
      <L x={188} y={108}>c</L>
      {/* d — bottom angled edge */}
      <line x1={45} y1={128} x2={155} y2={128} stroke={HIDDEN} strokeDasharray="3 3" />
      <L x={28} y={120}>d</L>
      {/* e — depth right of seat */}
      <line x1={185} y1={78} x2={185} y2={92} {...arrowProps} />
      <L x={200} y={88}>e</L>
      {/* f — back depth */}
      <line x1={102} y1={28} x2={113} y2={18} {...arrowProps} />
      <L x={120} y={14}>f</L>
    </svg>
  );
}

export function ClubChairDiagram({ className }: DiagramProps) {
  return (
    <svg {...svgProps(className)}>
      {defs()}
      {/* Seat cushion (front) */}
      <polygon points="20,120 130,120 145,105 35,105" fill="#fafafa" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="20,120 130,120 130,150 20,150" fill="#f0f0f0" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="130,120 145,105 145,135 130,150" fill="#e8e8e8" stroke={STROKE} strokeWidth={1.5} />
      {/* Back cushion (taller, behind) */}
      <polygon points="150,90 200,90 210,80 160,80" fill="#fafafa" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="150,90 200,90 200,150 150,150" fill="#f0f0f0" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="200,90 210,80 210,140 200,150" fill="#e8e8e8" stroke={STROKE} strokeWidth={1.5} />
      {/* a — width seat top */}
      <line x1={25} y1={100} x2={140} y2={100} {...arrowProps} />
      <L x={82} y={94}>a</L>
      {/* b — depth seat top (going back) */}
      <line x1={132} y1={118} x2={147} y2={103} {...arrowProps} />
      <L x={155} y={108}>b</L>
      {/* c — depth back top */}
      <line x1={202} y1={88} x2={212} y2={78} {...arrowProps} />
      <L x={218} y={84}>c</L>
      {/* d — height seat front */}
      <line x1={10} y1={122} x2={10} y2={148} {...arrowProps} />
      <L x={4} y={140}>d</L>
      {/* e — height back front */}
      <line x1={144} y1={92} x2={144} y2={148} {...arrowProps} />
      <L x={138} y={130}>e</L>
      {/* f — extra seat depth */}
      <line x1={25} y1={170} x2={130} y2={170} {...arrowProps} />
      <L x={77} y={184}>f</L>
    </svg>
  );
}

export function TrapezoidDiagram({ className }: DiagramProps) {
  return (
    <svg {...svgProps(className)}>
      {defs()}
      {/* Trapezoid top face */}
      <polygon
        points="35,55 185,55 155,135 65,135"
        fill="#fafafa"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      {/* Depth shadow */}
      <polygon
        points="35,55 185,55 195,65 45,65"
        fill="#e8e8e8"
        stroke={STROKE}
        strokeWidth={1}
      />
      <polygon
        points="155,135 185,55 195,65 165,145"
        fill="#dddddd"
        stroke={STROKE}
        strokeWidth={1}
      />
      {/* a — top width */}
      <line x1={40} y1={42} x2={180} y2={42} {...arrowProps} />
      <L x={110} y={32}>a</L>
      {/* b — right slanted side */}
      <line x1={195} y1={55} x2={165} y2={138} {...arrowProps} />
      <L x={205} y={100}>b</L>
      {/* d — bottom width */}
      <line x1={70} y1={155} x2={150} y2={155} {...arrowProps} />
      <L x={110} y={170}>d</L>
      {/* e — depth top to bottom */}
      <line x1={20} y1={58} x2={50} y2={132} {...arrowProps} />
      <L x={20} y={100}>e</L>
    </svg>
  );
}

export function BenchDiagram({ className }: DiagramProps) {
  return (
    <svg {...svgProps(className)}>
      {defs()}
      <polygon points="25,80 175,80 195,60 45,60" fill="#fafafa" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="25,80 175,80 175,130 25,130" fill="#f0f0f0" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="175,80 195,60 195,110 175,130" fill="#e8e8e8" stroke={STROKE} strokeWidth={1.5} />
      {/* a — width */}
      <line x1={30} y1={48} x2={190} y2={48} {...arrowProps} />
      <L x={110} y={40}>a</L>
      {/* b — height/thickness */}
      <line x1={210} y1={62} x2={210} y2={108} {...arrowProps} />
      <L x={205} y={88}>b</L>
      {/* e — depth top */}
      <line x1={177} y1={78} x2={197} y2={58} {...arrowProps} />
      <L x={205} y={50}>e</L>
    </svg>
  );
}

export function OttomanDiagram({ className }: DiagramProps) {
  return (
    <svg {...svgProps(className)}>
      {defs()}
      <polygon points="55,80 145,80 165,60 75,60" fill="#fafafa" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="55,80 145,80 145,140 55,140" fill="#f0f0f0" stroke={STROKE} strokeWidth={1.5} />
      <polygon points="145,80 165,60 165,120 145,140" fill="#e8e8e8" stroke={STROKE} strokeWidth={1.5} />
      {/* a — width */}
      <line x1={60} y1={48} x2={160} y2={48} {...arrowProps} />
      <L x={110} y={40}>a</L>
      {/* b — height */}
      <line x1={180} y1={62} x2={180} y2={118} {...arrowProps} />
      <L x={175} y={92}>b</L>
      {/* e — depth */}
      <line x1={147} y1={78} x2={167} y2={58} {...arrowProps} />
      <L x={175} y={48}>e</L>
    </svg>
  );
}

export function DiningChairDiagram({ className }: DiagramProps) {
  return (
    <svg {...svgProps(className)}>
      {defs()}
      <rect x={60} y={45} width={100} height={120} fill="#fafafa" stroke={STROKE} strokeWidth={1.5} />
      {/* a — width top */}
      <line x1={65} y1={32} x2={155} y2={32} {...arrowProps} />
      <L x={110} y={24}>a</L>
      {/* b — right side */}
      <line x1={175} y1={48} x2={175} y2={162} {...arrowProps} />
      <L x={170} y={108}>b</L>
      {/* e — full height */}
      <line x1={45} y1={48} x2={45} y2={162} {...arrowProps} />
      <L x={32} y={108}>e</L>
    </svg>
  );
}

export const CUSHION_TYPE_META = [
  {
    key: "hinged_chaise",
    label: "Hinged Chaise / Chair",
    description: "Long seat hinged to a back portion (recliner-style).",
    fields: ["a", "b", "c", "d", "e", "f"] as const,
    Diagram: HingedChaiseDiagram,
  },
  {
    key: "club_chair",
    label: "Club Chair (Seat & Back)",
    description: "Two cushions: seat and back.",
    fields: ["a", "b", "c", "d", "e", "f"] as const,
    Diagram: ClubChairDiagram,
  },
  {
    key: "trapezoid",
    label: "Trapezoid Seat",
    description: "Wider at the top, narrower at the bottom.",
    fields: ["a", "b", "d", "e"] as const,
    Diagram: TrapezoidDiagram,
  },
  {
    key: "bench",
    label: "Bench",
    description: "Wide flat rectangular cushion.",
    fields: ["a", "b", "e"] as const,
    Diagram: BenchDiagram,
  },
  {
    key: "ottoman",
    label: "Ottoman",
    description: "Square or near-square cushion.",
    fields: ["a", "b", "e"] as const,
    Diagram: OttomanDiagram,
  },
  {
    key: "dining_chair",
    label: "Dining Chair (Seat or Back)",
    description: "Flat rectangle for a dining chair seat or back.",
    fields: ["a", "b", "e"] as const,
    Diagram: DiningChairDiagram,
  },
] as const;

export type CushionTypeKey = (typeof CUSHION_TYPE_META)[number]["key"];
export type MeasurementField = "a" | "b" | "c" | "d" | "e" | "f";
