import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import FreeRoomPlannerLogo from "@/components/FreeRoomPlannerLogo";
import { useDocumentMeta } from "@/hooks/use-document-meta";

const features = [
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="9"/></svg>
    ),
    title: "Snap-to-grid",
    desc: "Every wall snaps to a 10cm grid — so the dimensions you send to a supplier are actually accurate.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>
    ),
    title: "Live measurements",
    desc: "Wall lengths update in real time as you draw, in metres, centimetres, or feet.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="6" rx="1"/><rect x="7" y="14" width="5" height="4" rx="1"/></svg>
    ),
    title: "30+ furniture items",
    desc: "Sofas, beds, kitchen units, doors, windows — drag from the library and resize to fit your exact space.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
    ),
    title: "Export as image",
    desc: "Download a clean PNG and send it to your fitter, kitchen maker, or architect. They don't need an account to view it.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9"/><path d="M9 21V12h6v9"/></svg>
    ),
    title: "Room labels",
    desc: "Name each space so your plan reads clearly at a glance — kitchen, lounge, en-suite.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
    ),
    title: "Undo / redo",
    desc: "Made a mistake? Ctrl+Z takes you back. No commitment required.",
  },
];

const steps = [
  { num: "1", title: "Draw your walls", desc: "Click to place points and connect them. Walls snap to a 10cm grid automatically." },
  { num: "2", title: "Add furniture", desc: "Drag sofas, units, appliances, and doors from the library. Resize to your exact dimensions." },
  { num: "3", title: "Export and send", desc: "Download a clean PNG and send it to your fitter, supplier, or architect. They don't need an account." },
];

const useCases = [
  { title: "Getting quotes", desc: "Share an accurate floor plan with multiple suppliers so you're comparing like for like — not guessing." },
  { title: "Kitchen renovations", desc: "Show your fitter exactly where units, appliances, and the island go — before anything is ordered." },
  { title: "Bathroom refits", desc: "Plan sanitaryware positions before the plumber arrives. Move things around on screen, not on site." },
  { title: "Extensions", desc: "Brief your architect with a clear sketch of what you have in mind before the expensive conversations start." },
  { title: "Room rearrangements", desc: "Try different furniture layouts without lifting a single thing." },
];

const faqs = [
  { q: "Is it really free?", a: "Yes. No trial period, no credit card, no premium tier hiding the good stuff. Free means free." },
  { q: "Do I need to give my email?", a: "No. Open the planner and start immediately. We don't ask for your email, your name, or anything else." },
  { q: "Does it work on mobile?", a: "Designed for desktop and tablet, where you have the space to work properly — though it runs on mobile too." },
  { q: "Can I save my plan?", a: "Yes — export it as a PNG to save locally or share directly with whoever needs it." },
  { q: "Is it accurate enough to share with a professional?", a: "Yes. Everything snaps to a 10cm grid and measurements display in real time. Export as a PNG and send it directly — they don't need an account to view it." },
  { q: "What units does it support?", a: "Metres, centimetres, millimetres, and feet." },
  { q: "Do I need to install anything?", a: "Nothing. It runs entirely in your browser — no app, no download, no plugin." },
  { q: "Can I add doors and windows?", a: "Yes. Doors and windows are in the furniture library — drag, drop, and resize to match your actual room." },
];

export default function Landing() {
  useDocumentMeta({
    title: "Free Room Planner — Draw Your Floor Plan, No Sign-Up",
    description: "Draw an accurate floor plan in minutes. Snap-to-grid walls, 30+ furniture items, live measurements. Free, forever. No email or download required.",
  });
  const [, navigate] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Fade-in on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("rs-visible");
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".rs-fade").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const goToApp = () => navigate("/app");

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={`min-h-screen font-sans ${isDark ? "bg-[#1a1a18] text-[#f0ede6]" : "bg-[#faf8f4] text-[#1a1a18]"} transition-colors duration-300`}>

      {/* Nav */}
      <header className={`sticky top-0 z-50 border-b ${isDark ? "bg-[#1a1a18]/95 border-[#2e2e2a]" : "bg-[#faf8f4]/95 border-[#e8e3d8]"} backdrop-blur-sm`}>
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FreeRoomPlannerLogo size={24} className={isDark ? "text-[#5ba89a]" : "text-[#3d8a7c]"} />
            <span className="font-semibold text-[15px] tracking-tight">Free Room Planner</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#how-it-works" onClick={scrollTo("how-it-works")} className={`${isDark ? "text-[#a09a8c] hover:text-[#f0ede6]" : "text-[#6b6457] hover:text-[#1a1a18]"} transition-colors`}>How it works</a>
            <a href="#features" onClick={scrollTo("features")} className={`${isDark ? "text-[#a09a8c] hover:text-[#f0ede6]" : "text-[#6b6457] hover:text-[#1a1a18]"} transition-colors`}>Features</a>
            <a href="#faq" onClick={scrollTo("faq")} className={`${isDark ? "text-[#a09a8c] hover:text-[#f0ede6]" : "text-[#6b6457] hover:text-[#1a1a18]"} transition-colors`}>FAQ</a>
            <a href="/get-embed" onClick={(e) => { e.preventDefault(); navigate("/get-embed"); }} className={`${isDark ? "text-[#a09a8c] hover:text-[#f0ede6]" : "text-[#6b6457] hover:text-[#1a1a18]"} transition-colors`}>For businesses</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDark((d) => !d)}
              className={`p-1.5 rounded-md ${isDark ? "hover:bg-[#2e2e2a] text-[#a09a8c]" : "hover:bg-[#f0ede6] text-[#6b6457]"} transition-colors`}
              aria-label="Toggle dark mode"
            >
              {isDark ? (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              )}
            </button>
            <button
              onClick={goToApp}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-[#3d8a7c] hover:bg-[#327368] text-white transition-colors"
            >
              Start planning
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-5 pt-20 pb-16 text-center">
        <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700">
          <div className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6 ${isDark ? "bg-[#2e2e2a] text-[#5ba89a]" : "bg-[#e8f4f1] text-[#3d8a7c]"}`}>
            No sign-up needed — start planning for free
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
            Draw your room.<br />Share your plan.
          </h1>
          <p className={`text-lg max-w-xl mx-auto mb-8 ${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>
            A browser-based floor planner built for homeowners across the UK and US. Brief kitchen makers, bathroom fitters, architects, and contractors — fast.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={goToApp}
              className="px-7 py-3 rounded-xl text-base font-semibold bg-[#3d8a7c] hover:bg-[#327368] text-white transition-colors shadow-sm"
            >
              Start planning — no sign-up needed
            </button>
            <a
              href="#how-it-works"
              onClick={scrollTo("how-it-works")}
              className={`px-7 py-3 rounded-xl text-base font-medium border transition-colors ${isDark ? "border-[#2e2e2a] hover:bg-[#2e2e2a] text-[#f0ede6]" : "border-[#d8d2c4] hover:bg-[#f0ede6] text-[#1a1a18]"}`}
            >
              See how it works
            </a>
          </div>
        </div>

        {/* SVG floor plan illustration */}
        <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 delay-200 mt-14">
          <div className={`rounded-2xl border overflow-hidden shadow-lg max-w-2xl mx-auto ${isDark ? "bg-[#222220] border-[#2e2e2a]" : "bg-white border-[#e8e3d8]"}`}>
            {/* Browser chrome */}
            <div className={`flex items-center gap-1.5 px-4 py-3 border-b ${isDark ? "border-[#2e2e2a] bg-[#1e1e1c]" : "border-[#e8e3d8] bg-[#f5f2ec]"}`}>
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"/>
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"/>
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]"/>
              <span className={`ml-3 text-xs ${isDark ? "text-[#5a5a52]" : "text-[#9a9488]"}`}>freeroomplanner.com/app</span>
            </div>
            {/* Floor plan illustration */}
            <svg viewBox="0 0 640 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" role="img" aria-label="Kitchen floor plan created with Free Room Planner showing furniture layout, measurements, and room labels">
              {/* Background */}
              <rect width="640" height="400" fill={isDark ? "#222220" : "#ffffff"} />

              {/* Grid */}
              {Array.from({ length: 16 }).map((_, i) => (
                <line key={`vg${i}`} x1={40 * i} y1="0" x2={40 * i} y2="400" stroke={isDark ? "#2e2e2a" : "#f0ede6"} strokeWidth="0.5" />
              ))}
              {Array.from({ length: 10 }).map((_, i) => (
                <line key={`hg${i}`} x1="0" y1={40 * i} x2="640" y2={40 * i} stroke={isDark ? "#2e2e2a" : "#f0ede6"} strokeWidth="0.5" />
              ))}

              {/* Room walls */}
              <rect x="80" y="60" width="480" height="280" fill="none" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="3" />

              {/* Door opening (bottom wall) */}
              <line x1="280" y1="340" x2="360" y2="340" stroke={isDark ? "#222220" : "#ffffff"} strokeWidth="5" />
              {/* Door arc */}
              <path d="M 280 340 A 80 80 0 0 1 280 260" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1.5" fill="none" strokeDasharray="4 3" />

              {/* Window (top wall) */}
              <line x1="200" y1="60" x2="340" y2="60" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="6" />
              <line x1="200" y1="60" x2="340" y2="60" stroke={isDark ? "#3d6b62" : "#a8ddd0"} strokeWidth="2" />

              {/* Kitchen counter (L-shape along top-right) */}
              <rect x="400" y="70" width="150" height="50" rx="4" fill={isDark ? "#2e2e2a" : "#f5f2ec"} stroke={isDark ? "#5a5a52" : "#d8d2c4"} strokeWidth="1.5" />
              <rect x="500" y="70" width="50" height="140" rx="4" fill={isDark ? "#2e2e2a" : "#f5f2ec"} stroke={isDark ? "#5a5a52" : "#d8d2c4"} strokeWidth="1.5" />
              {/* Sink */}
              <rect x="430" y="80" width="36" height="28" rx="6" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1.5" />
              <circle cx="448" cy="94" r="4" fill={isDark ? "#5a5a52" : "#c4bfb4"} />
              {/* Stove */}
              <rect x="510" y="100" width="30" height="36" rx="3" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1.5" />
              <circle cx="520" cy="110" r="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />
              <circle cx="530" cy="110" r="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />
              <circle cx="520" cy="124" r="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />
              <circle cx="530" cy="124" r="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />

              {/* Kitchen island */}
              <rect x="260" y="160" width="140" height="70" rx="6" fill={isDark ? "#2e2e2a" : "#f5f2ec"} stroke={isDark ? "#5a5a52" : "#d8d2c4"} strokeWidth="1.5" />

              {/* Dining table */}
              <rect x="120" y="170" width="90" height="60" rx="8" fill={isDark ? "#2e2e2a" : "#f5f2ec"} stroke={isDark ? "#5a5a52" : "#d8d2c4"} strokeWidth="1.5" />
              {/* Chairs */}
              <rect x="138" y="152" width="20" height="14" rx="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />
              <rect x="172" y="152" width="20" height="14" rx="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />
              <rect x="138" y="234" width="20" height="14" rx="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />
              <rect x="172" y="234" width="20" height="14" rx="4" fill="none" stroke={isDark ? "#5a5a52" : "#c4bfb4"} strokeWidth="1" />

              {/* Fridge */}
              <rect x="500" y="220" width="50" height="60" rx="4" fill={isDark ? "#2e2e2a" : "#f5f2ec"} stroke={isDark ? "#5a5a52" : "#d8d2c4"} strokeWidth="1.5" />
              <line x1="500" y1="248" x2="550" y2="248" stroke={isDark ? "#5a5a52" : "#d8d2c4"} strokeWidth="1" />

              {/* Dimension lines */}
              {/* Top dimension */}
              <line x1="80" y1="42" x2="560" y2="42" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1" />
              <line x1="80" y1="36" x2="80" y2="48" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1" />
              <line x1="560" y1="36" x2="560" y2="48" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1" />
              <text x="320" y="38" textAnchor="middle" fill={isDark ? "#5ba89a" : "#3d8a7c"} fontSize="11" fontFamily="sans-serif">4.8 m</text>

              {/* Left dimension */}
              <line x1="62" y1="60" x2="62" y2="340" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1" />
              <line x1="56" y1="60" x2="68" y2="60" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1" />
              <line x1="56" y1="340" x2="68" y2="340" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1" />
              <text x="50" y="204" textAnchor="middle" fill={isDark ? "#5ba89a" : "#3d8a7c"} fontSize="11" fontFamily="sans-serif" transform="rotate(-90 50 204)">2.8 m</text>

              {/* Room label */}
              <text x="320" y="300" textAnchor="middle" fill={isDark ? "#5a5a52" : "#c4bfb4"} fontSize="14" fontFamily="sans-serif" fontWeight="500">Kitchen</text>
            </svg>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className={`border-y ${isDark ? "border-[#2e2e2a] bg-[#1e1e1c]" : "border-[#e8e3d8] bg-[#f5f2ec]"}`}>
        <div className="max-w-5xl mx-auto px-5 py-5 flex flex-wrap justify-center gap-8">
          {[
            { val: "1,200+", label: "plans created" },
            { val: "30+", label: "furniture items" },
            { val: "4.8 / 5", label: "user rating" },
            { val: "0", label: "emails required" },
          ].map((s) => (
            <div key={s.val} className="text-center">
              <div className={`text-xl font-bold ${isDark ? "text-[#5ba89a]" : "text-[#3d8a7c]"}`}>{s.val}</div>
              <div className={`text-xs mt-0.5 ${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-5 py-20">
        <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">How it works</h2>
          <p className={`${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>From blank page to shareable plan in under five minutes.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <div key={s.num} className="rs-fade opacity-0 translate-y-4 transition-all duration-700 text-center" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-4 ${isDark ? "bg-[#2e2e2a] text-[#5ba89a]" : "bg-[#e8f4f1] text-[#3d8a7c]"}`}>
                {s.num}
              </div>
              <h3 className="font-semibold text-base mb-2">{s.title}</h3>
              <p className={`text-sm leading-relaxed ${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className={`${isDark ? "bg-[#1e1e1c]" : "bg-[#f5f2ec]"} py-20`}>
        <div className="max-w-5xl mx-auto px-5">
          <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Everything you need</h2>
            <p className={`${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>Purpose-built for homeowners, not architects.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <div key={f.title} className={`rs-fade opacity-0 translate-y-4 transition-all duration-700 rounded-xl p-5 border ${isDark ? "bg-[#222220] border-[#2e2e2a]" : "bg-white border-[#e8e3d8]"}`} style={{ transitionDelay: `${i * 60}ms` }}>
                <div className={`mb-3 ${isDark ? "text-[#5ba89a]" : "text-[#3d8a7c]"}`}>{f.icon}</div>
                <h3 className="font-semibold text-sm mb-1.5">{f.title}</h3>
                <p className={`text-sm leading-relaxed ${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="max-w-5xl mx-auto px-5 py-20">
        <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Plan it properly before a single unit is ordered or a wall is touched.</h2>
          <p className={`${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>Homeowners use Free Room Planner to go into supplier and contractor conversations fully prepared.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {useCases.map((u, i) => (
            <div key={u.title} className={`rs-fade opacity-0 translate-y-4 transition-all duration-700 rounded-xl p-5 border flex gap-4 ${isDark ? "bg-[#222220] border-[#2e2e2a]" : "bg-white border-[#e8e3d8]"}`} style={{ transitionDelay: `${i * 80}ms` }}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isDark ? "bg-[#2e2e2a] text-[#5ba89a]" : "bg-[#e8f4f1] text-[#3d8a7c]"}`}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1">{u.title}</h3>
                <p className={`text-sm leading-relaxed ${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>{u.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className={`${isDark ? "bg-[#1e1e1c]" : "bg-[#f5f2ec]"} py-20`}>
        <div className="max-w-2xl mx-auto px-5">
          <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">FAQ</h2>
          </div>
          <div className="space-y-2">
            {faqs.map((f, i) => (
              <div key={f.q} className={`rs-fade opacity-0 translate-y-4 transition-all duration-700 rounded-xl border overflow-hidden ${isDark ? "border-[#2e2e2a]" : "border-[#e8e3d8]"}`} style={{ transitionDelay: `${i * 60}ms` }}>
                <button
                  className={`w-full text-left px-5 py-4 flex items-center justify-between gap-3 text-sm font-medium ${isDark ? "hover:bg-[#2a2a28]" : "hover:bg-[#f0ede6]"} transition-colors`}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{f.q}</span>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className={`shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {openFaq === i && (
                  <div className={`px-5 pb-4 text-sm leading-relaxed ${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For businesses */}
      <section className={`${isDark ? "bg-[#1a1a18]" : "bg-[#faf8f4]"} py-20`}>
        <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 max-w-2xl mx-auto px-5 text-center">
          <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight mb-3 ${isDark ? "text-[#f0ede6]" : "text-[#1a1a18]"}`}>Add Free Room Planner to your website</h2>
          <p className={`mb-8 ${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>Embed a branded room planner on your site — free. Let your customers visualize their space before they buy.</p>
          <button
            onClick={() => navigate("/get-embed")}
            className={`px-8 py-3.5 rounded-xl text-base font-semibold transition-colors shadow-md ${isDark ? "bg-[#2e2e2a] hover:bg-[#3a3a36] text-[#f0ede6]" : "bg-[#1a1a18] hover:bg-[#2e2e2a] text-white"}`}
          >
            Get your embed code
          </button>
        </div>
      </section>

      {/* Final CTA */}
      <section className={`${isDark ? "bg-[#222220]" : "bg-[#1a1a18]"} py-16`}>
        <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 max-w-xl mx-auto px-5 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">Ready to plan your renovation?</h2>
          <p className="text-[#a09a8c] mb-8">Free. No download. No email. No fluff.</p>
          <button
            onClick={goToApp}
            className="px-8 py-3.5 rounded-xl text-base font-semibold bg-[#3d8a7c] hover:bg-[#327368] text-white transition-colors shadow-md"
          >
            Start planning — no sign-up needed
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className={`border-t py-8 ${isDark ? "border-[#2e2e2a] bg-[#1a1a18] text-[#5a5a52]" : "border-[#e8e3d8] bg-[#faf8f4] text-[#9a9488]"}`}>
        <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <FreeRoomPlannerLogo size={16} className={isDark ? "text-[#5a5a52]" : "text-[#9a9488]"} />
            <span>Free Room Planner</span>
          </div>
          <a href="/get-embed" onClick={(e) => { e.preventDefault(); navigate("/get-embed"); }} className={`${isDark ? "text-[#5a5a52] hover:text-[#a09a8c]" : "text-[#9a9488] hover:text-[#6b6457]"} transition-colors`}>For businesses</a>
          <span>© {new Date().getFullYear()} Free Room Planner. Free to use.</span>
        </div>
      </footer>

      <style>{`
        .rs-fade { opacity: 0; transform: translateY(16px); transition: opacity 0.6s ease, transform 0.6s ease; }
        .rs-visible { opacity: 1 !important; transform: translateY(0) !important; }
      `}</style>
    </div>
  );
}
