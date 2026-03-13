export default function TopBar({ title, onMenuClick, children }) {
  return (
    <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-brand-border px-6 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden text-brand-slate hover:text-brand-navy">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-brand-teal">{title}</h2>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {children}
      </div>
    </header>
  );
}
