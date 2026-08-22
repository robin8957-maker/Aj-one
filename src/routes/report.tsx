import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/report")({
  component: () => {
    if (typeof window !== "undefined") {
      window.location.replace("/report.html");
    }
    return (
      <main className="grid min-h-dvh place-items-center bg-[#0b0d11] p-6 text-[#e8e6df]">
        <a className="rounded-full bg-[#d4af77] px-5 py-3 font-semibold text-[#14120c]" href="/report.html">
          افتح التقرير الكامل
        </a>
      </main>
    );
  },
});
