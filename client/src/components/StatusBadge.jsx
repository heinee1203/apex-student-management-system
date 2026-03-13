export default function StatusBadge({ status }) {
  const styles = {
    Enrolled: 'bg-[#2E8B6A]/15 text-[#2E8B6A]',
    Dropped: 'bg-[#C0504D]/15 text-[#C0504D]',
    LOA: 'bg-[#D4913B]/15 text-[#D4913B]',
    Graduated: 'bg-[#6B9DB5]/15 text-[#2C5F6E]',
    Irregular: 'bg-[#8A6DB5]/15 text-[#6B4D8A]',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[status] || 'bg-brand-light text-brand-slate'}`}>
      {status}
    </span>
  );
}
