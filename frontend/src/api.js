const API = '/api';

function headers() {
  const token = localStorage.getItem('lis_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers: { ...headers(), ...options.headers } });
  } catch {
    throw new Error('Tidak bisa hubungi server. Pastikan backend jalan (npm start).');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('lis_token');
      window.location.href = '/login';
    }
    throw new Error(data.error || res.statusText);
  }
  return data;
}

export const api = {
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/auth/me'),
  dashboard: () => request('/dashboard/stats'),
  patients: {
    list: (q) => request(`/patients?q=${encodeURIComponent(q || '')}`),
    get: (id) => request(`/patients/${id}`),
    create: (body) => request('/patients', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => request(`/patients/${id}`, { method: 'DELETE' }),
  },
  requests: {
    list: (q, status, startDate, endDate) => {
      const params = new URLSearchParams();
      if (q) params.append('q', q);
      if (status) params.append('status', status);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      return request(`/requests?${params.toString()}`);
    },
    get: (id) => request(`/requests/${id}`),
    create: (body) => request('/requests', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/requests/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    setStatus: (id, status) => request(`/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    remove: (id) => request(`/requests/${id}`, { method: 'DELETE' }),
  },
  results: {
    list: (patientId) => request(`/results${patientId ? `?patient_id=${patientId}` : ''}`),
    groups: (q, startDate, endDate) => {
      const params = new URLSearchParams();
      if (q) params.append('q', q);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      return request(`/results/groups?${params.toString()}`);
    },
    create: (body) => request('/results', { method: 'POST', body: JSON.stringify(body) }),
    createBatch: (body) => request('/results/batch', { method: 'POST', body: JSON.stringify(body) }),
    setVisibility: (id, is_printable) => request(`/results/${id}/visibility`, { method: 'PATCH', body: JSON.stringify({ is_printable }) }),
    remove: (id) => request(`/results/${id}`, { method: 'DELETE' }),
    removeGroup: (patientId, examDate) => request(`/results/group/batch?patient_id=${patientId}&exam_date=${examDate}`, { method: 'DELETE' }),
    verify: (id) => request(`/results/${id}/verify`, { method: 'PATCH' }),
    verifyRequest: (requestId) => request(`/results/verify-request/${requestId}`, { method: 'POST' }),
    verifyGroup: (patient_id, exam_date) => request('/results/verify-group', { method: 'POST', body: JSON.stringify({ patient_id, exam_date }) }),
    criticalUnacked: () => request('/results/critical/unacked'),
    // Melaporkan hasil kritis: nama penerima wajib, karena catatan tanpa itu
    // tidak membuktikan hasilnya benar-benar sampai ke yang merawat pasien.
    ackCritical: (id, body) => request(`/results/${id}/ack-critical`, { method: 'PATCH', body: JSON.stringify(body) }),
    criticalLog: () => request('/results/critical/log'),
    revisions: (id) => request(`/results/${id}/revisions`),
    trend: (patientId, testId) => request(`/results/trend?patient_id=${patientId}&test_id=${testId}`),
  },
  unmatched: {
    list: (status = 'pending') => request(`/unmatched?status=${status}`),
    count: () => request('/unmatched/count'),
    get: (id) => request(`/unmatched/${id}`),
    match: (id, patient_id) => request(`/unmatched/${id}/match`, { method: 'POST', body: JSON.stringify({ patient_id }) }),
    discard: (id, note) => request(`/unmatched/${id}/discard`, { method: 'POST', body: JSON.stringify({ note }) }),
  },
  qc: {
    list: () => request('/qc'),
    summary: () => request('/qc/summary'),
    lots: () => request('/qc/lots'),
    createLot: (body) => request('/qc/lots', { method: 'POST', body: JSON.stringify(body) }),
    updateLot: (id, body) => request(`/qc/lots/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    chart: (instrument_id, test_id, level, hari = 30) => {
      const p = new URLSearchParams({ instrument_id, test_id, hari });
      if (level) p.append('level', level);
      return request(`/qc/chart?${p.toString()}`);
    },
  },
  pme: {
    programs: () => request('/pme/programs'),
    createProgram: (body) => request('/pme/programs', { method: 'POST', body: JSON.stringify(body) }),
    updateProgram: (id, body) => request(`/pme/programs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    results: (programId) => request(`/pme/results${programId ? `?program_id=${programId}` : ''}`),
    createResult: (body) => request('/pme/results', { method: 'POST', body: JSON.stringify(body) }),
    removeResult: (id) => request(`/pme/results/${id}`, { method: 'DELETE' }),
  },
  audit: {
    list: (params = {}) => {
      const p = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => { if (v) p.append(k, v); });
      return request(`/audit?${p.toString()}`);
    },
  },
  tests: {
    list: () => request('/tests'),
    create: (body) => request('/tests', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/tests/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => request(`/tests/${id}`, { method: 'DELETE' }),
    setVisibility: (id, show_in_report) => request(`/tests/${id}/visibility`, { method: 'PATCH', body: JSON.stringify({ show_in_report }) }),
    setSortOrder: (id, sort_order) => request(`/tests/${id}/sort-order`, { method: 'PATCH', body: JSON.stringify({ sort_order }) }),
    reorder: (orders) => request('/tests/reorder', { method: 'POST', body: JSON.stringify({ orders }) }),
  },
  users: {
    list: () => request('/users'),
    roles: () => request('/users/roles'),
    create: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    setPassword: (id, password) =>
      request(`/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }),
    remove: (id) => request(`/users/${id}`, { method: 'DELETE' }),
    setRolePerms: (roleId, permission_ids) =>
      request(`/users/roles/${roleId}/permissions`, { method: 'PUT', body: JSON.stringify({ permission_ids }) }),
  },
  settings: {
    get: () => request('/settings'),
    update: (body) => request('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  },
  apiKeys: {
    list: () => request('/api-keys'),
    create: (body) => request('/api-keys', { method: 'POST', body: JSON.stringify(body) }),
    remove: (id) => request(`/api-keys/${id}`, { method: 'DELETE' })
  },
  instruments: {
    list: () => request('/instruments'),
    create: (body) => request('/instruments', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/instruments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => request(`/instruments/${id}`, { method: 'DELETE' }),
    maps: (id) => request(`/instruments/${id}/maps`),
    addMap: (id, body) => request(`/instruments/${id}/maps`, { method: 'POST', body: JSON.stringify(body) }),
    deleteMap: (mapId) => request(`/instruments/maps/${mapId}`, { method: 'DELETE' }),
    logs: () => request('/instruments/logs/recent'),
    reload: () => request('/instruments/reload', { method: 'POST' }),
  },
  mapping: {
    get: () => request('/mapping'),
    create: (body) => request('/mapping', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/mapping/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id) => request(`/mapping/${id}`, { method: 'DELETE' }),
    saveConfig: (body) => request('/mapping/config/simrs', { method: 'PUT', body: JSON.stringify(body) }),
    pushResult: (id) => request(`/mapping/bridge/push-result/${id}`, { method: 'POST' }),
    pullOrders: () => request('/mapping/bridge/pull-orders', { method: 'POST' }),
  },
};
