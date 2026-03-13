const BASE_URL = '/api';

async function request(url, options = {}) {
  const token = sessionStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/me')) {
    sessionStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getMe: () => request('/auth/me'),
  changePassword: (data) => request('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),

  // Users
  getUsers: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  resetUserPassword: (id, data) => request(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify(data) }),

  // Students
  getStudents: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/students${qs ? `?${qs}` : ''}`);
  },
  getStudent: (studentId) => request(`/students/${studentId}`),
  createStudent: (data) => request('/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (studentId, data) => request(`/students/${studentId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (studentId) => request(`/students/${studentId}`, { method: 'DELETE' }),

  // Obligations
  getObligations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/obligations${qs ? `?${qs}` : ''}`);
  },
  getObligation: (id) => request(`/obligations/${id}`),
  createObligation: (data) => request('/obligations', { method: 'POST', body: JSON.stringify(data) }),
  updateObligation: (id, data) => request(`/obligations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteObligation: (id) => request(`/obligations/${id}`, { method: 'DELETE' }),
  bulkCreateObligations: (data) => request('/obligations/bulk', { method: 'POST', body: JSON.stringify(data) }),

  // Payments
  getPayments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/payments${qs ? `?${qs}` : ''}`);
  },
  getPayment: (id) => request(`/payments/${id}`),
  createPayment: (data) => request('/payments', { method: 'POST', body: JSON.stringify(data) }),
  updatePayment: (id, data) => request(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePayment: (id) => request(`/payments/${id}`, { method: 'DELETE' }),

  // Dashboard
  getDashboardStats: () => request('/dashboard/stats'),
  getRecentPayments: (limit = 10) => request(`/dashboard/recent-payments?limit=${limit}`),
  getBalanceList: () => request('/dashboard/balance-list'),
  getFeeBreakdown: () => request('/dashboard/fee-breakdown'),

  // SOA
  getSOA: (studentId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/soa/${studentId}${qs ? `?${qs}` : ''}`);
  },

  // Reports
  getReportByGradeLevel: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/by-grade-level${qs ? `?${qs}` : ''}`);
  },
  getReportByPaymentMethod: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/by-payment-method${qs ? `?${qs}` : ''}`);
  },
  getReportScholarships: () => request('/reports/scholarships'),
  getReportOverdue: () => request('/reports/overdue'),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Tuition Schedule
  getTuitionSchedule: (schoolYear) => request(`/tuition-schedule?school_year=${encodeURIComponent(schoolYear)}`),
  updateTuitionSchedule: (data) => request('/tuition-schedule', { method: 'PUT', body: JSON.stringify(data) }),
  getTuitionRate: (gradeLevel, schoolYear) => request(`/tuition-schedule/rate?grade_level=${encodeURIComponent(gradeLevel)}&school_year=${encodeURIComponent(schoolYear)}`),
  getTuitionSchoolYears: () => request('/tuition-schedule/school-years'),
  copyTuitionSchedule: (data) => request('/tuition-schedule/copy', { method: 'POST', body: JSON.stringify(data) }),

  // Fee Types
  getFeeTypes: () => request('/fee-types'),
  createFeeType: (data) => request('/fee-types', { method: 'POST', body: JSON.stringify(data) }),
  updateFeeType: (id, data) => request(`/fee-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFeeType: (id) => request(`/fee-types/${id}`, { method: 'DELETE' }),

  // Default Fees
  getDefaultFees: (schoolYear) => request(`/default-fees?school_year=${encodeURIComponent(schoolYear)}`),
  createDefaultFee: (data) => request('/default-fees', { method: 'POST', body: JSON.stringify(data) }),
  updateDefaultFee: (id, data) => request(`/default-fees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDefaultFee: (id) => request(`/default-fees/${id}`, { method: 'DELETE' }),
};
