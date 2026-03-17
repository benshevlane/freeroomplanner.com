import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import FreeRoomPlannerLogo from "@/components/FreeRoomPlannerLogo";

const features = [
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="9"/></svg>
    ),
    title: "Snap-to-grid",
    desc: "Every wall snaps to a 10 cm grid so your dimensions stay accurate without effort.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="16" y2="14"/></svg>
    ),
    title: "Live measurements",
    desc: "Wall lengths update in real time as you draw — in metres or feet.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="7" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="6" rx="1"/><rect x="7" y="14" width="5" height="4" rx="1"/></svg>
    ),
    title: "30+ furniture items",
    desc: "Sofas, beds, kitchen units, doors, windows — drag and drop from the library.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
    ),
    title: "Export as image",
    desc: "Download a clean PNG of your floor plan to share with builders, designers, or family.",
  },
  {
    icon: (
      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 12l9-9 9 9"/><path d="M9 21V12h6v9"/></svg>
    ),
    title: "Room labels",
    desc: "Name each space — kitchen, lounge, en-suite — so your plan reads clearly at a glance.",
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
  { num: "1", title: "Draw your walls", desc: "Click to place points and chain walls together. Alignment guides keep everything straight." },
  { num: "2", title: "Add furniture", desc: "Drag items from the library, resize them, and rotate to fit your space." },
  { num: "3", title: "Export and share", desc: "Download a PNG and share it with whoever needs to see it." },
];

const useCases = [
  { title: "Kitchen renovations", desc: "Show your fitter exactly where units, appliances, and the island go." },
  { title: "Bathroom refits", desc: "Plan sanitaryware positions before the plumber arrives." },
  { title: "Extensions", desc: "Brief architects with a clear sketch of what you have in mind." },
  { title: "Room rearrangements", desc: "Try different furniture layouts without lifting a single thing." },
];

const faqs = [
  { q: "Is it really free?", a: "Yes — completely free, no account required, no credit card, no catch." },
  { q: "Does it work on mobile?", a: "Yes. The tool works on tablet and mobile, though a desktop gives you the most space to draw." },
  { q: "Can I save my plan?", a: "Yes. Use the save button to download a JSON file you can reload later, or export a PNG to share with others." },
  { q: "What units does it support?", a: "Both metric (metres) and imperial (feet). Switch between them with the m/ft button in the toolbar." },
  { q: "Do I need to install anything?", a: "No. It runs entirely in your browser — just open the link and start drawing." },
  { q: "Can I add doors and windows?", a: "Yes — doors and windows are in the Structure category of the furniture library." },
];

export default function Landing() {
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
              Start planning — it's free
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
            {/* Floor plan SVG */}
            <svg viewBox="0 0 480 280" className="w-full" style={{ background: isDark ? "#222220" : "#faf8f4" }}>
              <defs>
                <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke={isDark ? "#2a2a28" : "#e8e3d8"} strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="480" height="280" fill="url(#grid)"/>
              <rect x="60" y="40" width="240" height="180" fill={isDark ? "rgba(61,138,124,0.08)" : "rgba(61,138,124,0.06)"} stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="2.5" rx="1"/>
              <line x1="60" y1="140" x2="180" y2="140" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="2.5"/>
              <line x1="180" y1="140" x2="180" y2="220" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="2.5"/>
              <path d="M 180 140 A 24 24 0 0 1 204 140" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1.5" fill="none" strokeDasharray="3 2"/>
              <line x1="180" y1="140" x2="180" y2="116" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1"/>
              <rect x="80" y="60" width="80" height="36" rx="4" fill={isDark ? "#3a3a36" : "#e8e3d8"} stroke={isDark ? "#5a5a52" : "#c8c0b0"} strokeWidth="1"/>
              <rect x="82" y="62" width="20" height="32" rx="3" fill={isDark ? "#4a4a44" : "#d8d2c0"}/>
              <rect x="138" y="62" width="20" height="32" rx="3" fill={isDark ? "#4a4a44" : "#d8d2c0"}/>
              <rect x="100" y="106" width="40" height="24" rx="3" fill={isDark ? "#4a4a44" : "#d4cebe"} stroke={isDark ? "#5a5a52" : "#b8b0a0"} strokeWidth="1"/>
              <rect x="200" y="150" width="80" height="55" rx="3" fill={isDark ? "#3a3a36" : "#e8e3d8"} stroke={isDark ? "#5a5a52" : "#c8c0b0"} strokeWidth="1"/>
              <rect x="200" y="150" width="80" height="16" rx="2" fill={isDark ? "#4a4a44" : "#d0cabe"}/>
              <ellipse cx="218" cy="158" rx="9" ry="6" fill={isDark ? "#5a5a52" : "#c0b8a8"}/>
              <ellipse cx="262" cy="158" rx="9" ry="6" fill={isDark ? "#5a5a52" : "#c0b8a8"}/>
              <text x="170" y="237" textAnchor="middle" fontSize="9" fill={isDark ? "#5ba89a" : "#3d8a7c"} fontFamily="sans-serif">6.00 m</text>
              <line x1="60" y1="233" x2="300" y2="233" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1"/>
              <line x1="60" y1="229" x2="60" y2="237" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1"/>
              <line x1="300" y1="229" x2="300" y2="237" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1"/>
              <text x="322" y="130" textAnchor="start" fontSize="9" fill={isDark ? "#5ba89a" : "#3d8a7c"} fontFamily="sans-serif">4.50 m</text>
              <line x1="315" y1="40" x2="315" y2="220" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1"/>
              <line x1="311" y1="40" x2="319" y2="40" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1"/>
              <line x1="311" y1="220" x2="319" y2="220" stroke={isDark ? "#5ba89a" : "#3d8a7c"} strokeWidth="1"/>
              <text x="110" y="165" textAnchor="middle" fontSize="10" fill={isDark ? "#a09a8c" : "#6b6457"} fontFamily="sans-serif" fontStyle="italic">Living room</text>
              <text x="246" y="135" textAnchor="middle" fontSize="10" fill={isDark ? "#a09a8c" : "#6b6457"} fontFamily="sans-serif" fontStyle="italic">Bedroom</text>
              <circle cx="340" cy="90" r="4" fill={isDark ? "#5ba89a" : "#3d8a7c"} opacity="0.7">
                <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite"/>
              </circle>
              <rect x="360" y="50" width="90" height="180" rx="8" fill={isDark ? "#1e1e1c" : "#f0ede6"} stroke={isDark ? "#2e2e2a" : "#d8d2c4"} strokeWidth="1"/>
              <text x="405" y="70" textAnchor="middle" fontSize="8" fill={isDark ? "#a09a8c" : "#6b6457"} fontFamily="sans-serif">Tools</text>
              {["Walls","Select","Eraser","Labels"].map((t, i) => (
                <g key={t}>
                  <rect x="368" y={78 + i * 28} width="74" height="22" rx="4"
                    fill={i === 0 ? (isDark ? "#3d8a7c" : "#3d8a7c") : "transparent"}
                    stroke={isDark ? "#2e2e2a" : "#d8d2c4"} strokeWidth="0.5"/>
                  <text x="405" y={93 + i * 28} textAnchor="middle" fontSize="8"
                    fill={i === 0 ? "#fff" : (isDark ? "#a09a8c" : "#6b6457")} fontFamily="sans-serif">{t}</text>
                </g>
              ))}
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
            { val: "100%", label: "free, forever" },
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
          <p className={`${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>Three steps from blank page to shared plan.</p>
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
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">Built for real projects</h2>
          <p className={`${isDark ? "text-[#a09a8c]" : "text-[#6b6457]"}`}>Homeowners use Free Room Planner to communicate clearly before work starts.</p>
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

      {/* Final CTA */}
      <section className={`${isDark ? "bg-[#222220]" : "bg-[#1a1a18]"} py-16`}>
        <div className="rs-fade opacity-0 translate-y-4 transition-all duration-700 max-w-xl mx-auto px-5 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">Ready to draw your plan?</h2>
          <p className="text-[#a09a8c] mb-8">Free. Fast. No fluff.</p>
          <button
            onClick={goToApp}
            className="px-8 py-3.5 rounded-xl text-base font-semibold bg-[#3d8a7c] hover:bg-[#327368] text-white transition-colors shadow-md"
          >
            Open Free Room Planner
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
