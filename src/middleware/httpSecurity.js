import { securityConfig } from '../config/security.js';

const permissionsPolicy = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()'
].join(', ');

const contentSecurityPolicy =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function isSecureRequest(req) {
  if (req.secure) return true;

  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();

  return forwardedProto === 'https';
}

export function applyHttpSecurity(req, res, next) {
  res.set({
    'Content-Security-Policy': contentSecurityPolicy,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': permissionsPolicy,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Permitted-Cross-Domain-Policies': 'none',
  });

  if (isSecureRequest(req)) {
    res.set(
      'Strict-Transport-Security',
      `max-age=${securityConfig.hstsMaxAge}; includeSubDomains`
    );
  }

  next();
}
