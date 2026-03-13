export default function PayStatusBadge({ status }) {
  const styles = {
    Paid: 'bg-[#2E8B6A]/15 text-[#2E8B6A] border-[#2E8B6A]/30',
    Partial: 'bg-[#D4913B]/15 text-[#D4913B] border-[#D4913B]/30',
    Unpaid: 'bg-[#C0504D]/15 text-[#C0504D] border-[#C0504D]/30',
    Overdue: 'bg-[#C0504D]/20 text-[#C0504D] border-[#C0504D]/40 font-bold',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${styles[status] || styles.Unpaid}`}>
      {status}
    </span>
  );
}
