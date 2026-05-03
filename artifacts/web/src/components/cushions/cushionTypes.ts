import {
  HingedChaiseDiagram,
  ClubChairDiagram,
  TrapezoidDiagram,
  BenchDiagram,
  OttomanDiagram,
  DiningChairDiagram,
} from "./CushionDiagrams";

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
