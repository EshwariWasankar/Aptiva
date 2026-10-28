# API Documentation

*This documentation will be expanded as endpoints are implemented.*

## Base URL

```
/api/v1
```

## Authentication

Most endpoints require `Authorization: Bearer <access token>` header.

Public routes:
- `/api/v1/auth/register`
- `/api/v1/auth/login`
- `/api/v1/auth/google`
- `/api/v1/auth/google/callback`
- `/api/v1/assessments`
- `/api/v1/assessments/:slug/blueprint`

## Health Endpoints

### GET /api/v1/health

Liveness check.

**Response 200:**
```json
{
  "data": {
    "status": "ok",
    "timestamp": "2025-01-25T12:00:00Z"
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

### GET /api/v1/ready

Readiness check (database and Redis connectivity).

**Response 200:**
```json
{
  "data": {
    "status": "ready",
    "timestamp": "2025-01-25T12:00:00Z"
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

**Response 503:**
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Database not ready",
    "requestId": "req_..."
  }
}
```

## Error Codes

- `UNAUTHENTICATED` - 401
- `FORBIDDEN` - 403
- `NOT_FOUND` - 404
- `CONFLICT` - 409
- `VALIDATION_FAILED` - 422
- `RATE_LIMITED` - 429
- `INTERNAL` - 500

*See the Implementation Guide Section 11 for the complete endpoint specification.*
