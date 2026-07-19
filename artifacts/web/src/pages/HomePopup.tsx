import { useEffect, useRef, useState } from "react";
import { useListActiveBanners } from "@workspace/api-client-react";
import logoImg from "@/assets/logo.png";

const STYLE_GREEN = "#5C8A72";
const STYLE_AMBER = "#C77E1E";

function bandColor(style: string | undefined): string {
  return (style ?? "standard") === "alert" ? STYLE_AMBER : STYLE_GREEN;
}

function dismissKey(id: number): string {
  return `oasis_popup_dismissed_${id}`;
}

export default function HomePopup() {
  const { data: active } = useListActiveBanners();
  const [visible, setVisible] = useState(false);
  const [popup, setPopup] = useState<
    | { id: number; title: string; messageText: string; style?: string | null }
    | null
  >(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!active) return;
    const popups = active
      .filter((b) => b.type === "popup")
      .sort((a, b) => b.id - a.id);
    const candidate = popups[0] ?? null;
    if (!candidate) return;
    if (sessionStorage.getItem(dismissKey(candidate.id))) return;
    setPopup(candidate);
    setVisible(true);
  }, [active]);

  useEffect(() => {
    if (visible) {
      btnRef.current?.focus();
    }
  }, [visible]);

  function dismiss() {
    if (popup) sessionStorage.setItem(dismissKey(popup.id), "1");
    setVisible(false);
  }

  if (!visible || !popup) return null;

  const color = bandColor(popup.style ?? undefined);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      aria-hidden="false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-popup-title"
        className="relative w-full max-w-md mx-4 rounded-xl overflow-hidden shadow-2xl bg-white"
      >
        {/* Colored header band */}
        <div
          className="flex flex-col items-center gap-3 px-8 py-6"
          style={{ backgroundColor: color }}
        >
          <img
            src={logoImg}
            alt="Oasis Garden & Patio"
            className="h-10 object-contain brightness-0 invert"
          />
          <h2
            id="home-popup-title"
            className="font-bodoni text-white text-2xl font-semibold text-center leading-snug"
          >
            {popup.title}
          </h2>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          <p className="text-slate-700 text-sm leading-relaxed text-center">
            {popup.messageText}
          </p>
        </div>

        {/* Got it button */}
        <div className="px-8 pb-7">
          <button
            ref={btnRef}
            type="button"
            onClick={dismiss}
            className="w-full py-3 rounded-md text-white text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: color }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
