export default function StatCard({ label, value, sub, icon, color = 'cyan' }) {
  const colors = {
    cyan: 'border-l-[#6B9DB5]',
    emerald: 'border-l-[#2E8B6A]',
    amber: 'border-l-[#D4913B]',
    red: 'border-l-[#C0504D]',
    blue: 'border-l-[#6B9DB5]',
    purple: 'border-l-[#8A6DB5]',
  };

  return (
    <div className={`bg-white border border-brand-border border-l-4 ${colors[color]} rounded-xl p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-brand-slate font-medium uppercase tracking-wider">{label}</span>
        {icon && <span className="text-brand-slate">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-brand-teal font-mono">{value}</div>
      {sub && <div className="text-xs text-brand-slate mt-1">{sub}</div>}
    </div>
  );
}
