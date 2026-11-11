// PH4-T07 — k6 load script for the attempt submission path (E-041).
//
// Usage:
//   k6 run -e API_URL=http://localhost:4000/api/v1 \
//          -e EMAIL=student@example.com -e PASSWORD='...' \
//          tools/k6/attempt-submit.js
//
// NFR-003 target: submission p95 under 150 ms (checked via the `submit_ms`
// trend below). The script exercises login → session → serve → submit →
// finish so the answer-key/session caches are warm, matching production
// steady state.

import http from 'k6/http';
import { sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const API_URL = __ENV.API_URL || 'http://localhost:4000/api/v1';
const EMAIL = __ENV.EMAIL || 'student@example.com';
const PASSWORD = __ENV.PASSWORD || '';

export const options = {
  scenarios: {
    submitters: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    submit_ms: ['p(95)<150'],
    http_req_failed: ['rate<0.01'],
  },
};

const submitMs = new Trend('submit_ms', true);
const errors = new Rate('errors');

export function setup() {
  const res = http.post(`${API_URL}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status !== 201) throw new Error(`login failed: ${res.status} ${res.body}`);
  return { token: res.json('data.accessToken') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  const session = http.post(`${API_URL}/sessions`, JSON.stringify({ kind: 'practice' }), { headers });
  if (session.status !== 201) {
    errors.add(1);
    return;
  }
  const sessionId = session.json('data.id');

  // One MCQ attempt per VU iteration (questionId/numericInput come from env
  // so the script targets real bank rows).
  const questionId = __ENV.QUESTION_ID;
  if (!questionId) {
    errors.add(1);
    console.log('QUESTION_ID env required');
    return;
  }
  const selectedOptionId = __ENV.OPTION_ID || null;
  const numericInput = __ENV.NUMERIC_INPUT || null;

  const t0 = Date.now();
  const res = http.put(
    `${API_URL}/sessions/${sessionId}/attempts/${questionId}`,
    JSON.stringify({
      attemptId: uuidv4(),
      selectedOptionId,
      numericInput,
      skipped: false,
      answerChanges: 0,
      revisitCount: 0,
    }),
    { headers },
  );
  submitMs.add(Date.now() - t0);
  if (res.status !== 200) errors.add(1);

  http.post(`${API_URL}/sessions/${sessionId}/finish`, JSON.stringify({ attemptIds: [] }), { headers });
  sleep(0.2);
}
