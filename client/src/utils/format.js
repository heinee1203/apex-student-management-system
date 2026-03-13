export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₱0.00';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateISO(dateStr) {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}
