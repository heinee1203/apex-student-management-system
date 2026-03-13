export function getCurrentSchoolYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 6) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}
