// Summer Program API client — mirrors the pattern in src/utils/api.js
// All endpoints are under /api/summer/*

const BASE = '/api/summer';

async function request(path, options = {}) {
  const token = sessionStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const summerApi = {
  // Programs
  getPrograms: () => request('/programs'),
  getProgram: (id) => request(`/programs/${id}`),
  createProgram: (data) => request('/programs', { method: 'POST', body: JSON.stringify(data) }),
  updateProgram: (id, data) => request(`/programs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProgram: (id) => request(`/programs/${id}`, { method: 'DELETE' }),

  // Classes
  getClasses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/classes${qs ? `?${qs}` : ''}`);
  },
  getClass: (id) => request(`/classes/${id}`),
  createClass: (data) => request('/classes', { method: 'POST', body: JSON.stringify(data) }),
  updateClass: (id, data) => request(`/classes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteClass: (id) => request(`/classes/${id}`, { method: 'DELETE' }),
  cancelClass: (id) => request(`/classes/${id}/cancel`, { method: 'POST' }),

  // Enrollments
  getEnrollments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/enrollments${qs ? `?${qs}` : ''}`);
  },
  getEnrollment: (id) => request(`/enrollments/${id}`),
  createEnrollment: (data) => request('/enrollments', { method: 'POST', body: JSON.stringify(data) }),
  updateEnrollment: (id, data) => request(`/enrollments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  withdrawEnrollment: (id, data) => request(`/enrollments/${id}/withdraw`, { method: 'POST', body: JSON.stringify(data) }),

  // Payments
  getPayments: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/payments${qs ? `?${qs}` : ''}`);
  },
  getPayment: (id) => request(`/payments/${id}`),
  createPayment: (data) => request('/payments', { method: 'POST', body: JSON.stringify(data) }),
  voidPayment: (id, data) => request(`/payments/${id}/void`, { method: 'POST', body: JSON.stringify(data) }),

  // Attendance
  getAttendance: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/attendance${qs ? `?${qs}` : ''}`);
  },
  bulkAttendance: (data) => request('/attendance/bulk', { method: 'POST', body: JSON.stringify(data) }),
  getAttendanceSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/attendance/summary${qs ? `?${qs}` : ''}`);
  },

  // Reports
  getEnrollmentReport: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/enrollment?${qs}`);
  },
  getRevenueReport: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/revenue?${qs}`);
  },
  getOutstandingReport: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/reports/outstanding?${qs}`);
  },

  // Student search (for internal enrollment)
  searchStudents: (q) => request(`/students/search?q=${encodeURIComponent(q)}`),
};
