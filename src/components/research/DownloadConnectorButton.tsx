import { useEffect, useRef, useState } from "react";
import { Download, Apple, MonitorDown } from "lucide-react";
import { detectConnectorOS, startConnectorDownload } from "../../lib/connectorDownload";

// Shared by both variants below: click triggers an immediate download when
// the OS is confidently detected, otherwise opens a small macOS/Windows
// choice that closes on an outside click.
function useConnectorDownloadChoice() {
  const [choiceOpen, setChoiceOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!choiceOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setChoiceOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [choiceOpen]);

  function handleClick() {
    const os = detectConnectorOS();
    if (os) {
      startConnectorDownload(os);
      return;
    }
    setChoiceOpen(true);
  }

  function choose(os: "macos" | "windows") {
    startConnectorDownload(os);
    setChoiceOpen(false);
  }

  return { choiceOpen, containerRef, handleClick, choose };
}

// A single, permanent, low-key secondary action — always available so a VA
// can reinstall Connector any time, not gated behind any connection state.
// Deliberately no "Connected/Disconnected" status here: that would turn a
// simple download entry point into a health indicator this button was
// never meant to be (see SwipeResearchPlayer's needs_connector state for
// the actual reachability signal).
export function DownloadConnectorButton() {
  const { choiceOpen, containerRef, handleClick, choose } = useConnectorDownloadChoice();

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        onClick={handleClick}
        className="flex items-center gap-1.5 h-9 px-3.5 rounded-full glass-panel text-[12px] text-neutral-300 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors duration-150"
      >
        <Download size={12} />
        Download Connector
      </button>

      {choiceOpen && (
        <div className="absolute right-0 top-11 z-20 w-48 rounded-xl bg-[#141416] border border-white/[0.09] shadow-2xl p-1.5 animate-fade-in">
          <button
            onClick={() => choose("macos")}
            className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-[12.5px] text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100 transition-colors duration-150"
          >
            <Apple size={13} />
            macOS
          </button>
          <button
            onClick={() => choose("windows")}
            className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-[12.5px] text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100 transition-colors duration-150"
          >
            <MonitorDown size={13} />
            Windows
          </button>
        </div>
      )}
    </div>
  );
}

// A smaller, inline variant for pointing the way from inside the
// needs_connector state — same underlying detect-or-ask behavior, just
// styled as a plain text link rather than its own button chrome.
export function DownloadConnectorLink({ className }: { className?: string }) {
  const { choiceOpen, containerRef, handleClick, choose } = useConnectorDownloadChoice();

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={handleClick}
        className={className ?? "text-[11.5px] text-[#D39448] hover:brightness-110 transition-[filter] underline underline-offset-2"}
      >
        Download ReelForge Connector
      </button>

      {choiceOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 top-6 z-20 w-44 rounded-xl bg-[#141416] border border-white/[0.09] shadow-2xl p-1.5 animate-fade-in">
          <button
            onClick={() => choose("macos")}
            className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-[12px] text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100 transition-colors duration-150"
          >
            <Apple size={12} />
            macOS
          </button>
          <button
            onClick={() => choose("windows")}
            className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg text-[12px] text-neutral-300 hover:bg-white/[0.06] hover:text-neutral-100 transition-colors duration-150"
          >
            <MonitorDown size={12} />
            Windows
          </button>
        </div>
      )}
    </div>
  );
}
