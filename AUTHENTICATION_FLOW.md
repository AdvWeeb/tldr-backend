# Frontend Authentication Flow

This document describes the complete frontend authentication flow for the TLDR backend API.

## Overview

The authentication system uses JWT access tokens (short-lived, ~15 minutes) and refresh tokens (long-lived, ~7 days) stored securely in the database. All auth endpoints use POST requests to keep sensitive data out of URLs.

---

## 1. Registration Flow (`POST /auth/register`)

### Frontend Steps:

1. **User fills registration form**
   - Email
   - Password (min 8 chars, uppercase, lowercase, number, special char)
   - First name
   - Last name

2. **Frontend sends request**

   ```typescript
   POST /auth/register
   Headers: {
     "Content-Type": "application/json",
     "User-Agent": "<browser-user-agent>"
   }
   Body: {
     email: "user@example.com",
     password: "SecurePassword123!",
     firstName: "John",
     lastName: "Doe"
   }
   ```

3. **Backend Response (201 Created)**

   ```typescript
   {
     userId: 1,
     email: "user@example.com",
     tokens: {
       accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       expiresIn: 900,  // 15 minutes in seconds
       tokenType: "Bearer"
     },
     refreshToken: "uuid:randomTokenId"  // Format: "refreshTokenUuid:tokenId"
   }
   ```

4. **Frontend stores tokens**
   - Store `accessToken` in memory (or secure HTTP-only cookie)
   - Store `refreshToken` securely (localStorage/sessionStorage or HTTP-only cookie)
   - Set user state/logged-in flag

5. **Handle errors**
   - `409 Conflict`: Email already registered
   - `400 Bad Request`: Validation errors
   - `429 Too Many Requests`: Rate limit (5 requests per minute)

---

## 2. Login Flow (`POST /auth/login`)

### Frontend Steps:

1. **User enters credentials**
   - Email
   - Password

2. **Frontend sends request**

   ```typescript
   POST /auth/login
   Headers: {
     "Content-Type": "application/json",
     "User-Agent": "<browser-user-agent>"
   }
   Body: {
     email: "user@example.com",
     password: "SecurePassword123!"
   }
   ```

3. **Backend Response (200 OK)**

   ```typescript
   {
     userId: 1,
     email: "user@example.com",
     tokens: {
       accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       expiresIn: 900,
       tokenType: "Bearer"
     },
     refreshToken: "uuid:randomTokenId"
   }
   ```

4. **Frontend stores tokens** (same as registration)

5. **Handle errors**
   - `401 Unauthorized`: Invalid credentials
   - `429 Too Many Requests`: Rate limit (10 requests per minute)

---

## 3. Google OAuth Flow (`POST /auth/google`)

### Frontend Steps:

1. **User clicks "Sign in with Google"**
   - Frontend redirects to Google OAuth consent screen
   - Google redirects back with authorization code

2. **Frontend receives authorization code** from Google redirect

3. **Frontend sends code to backend**

   ```typescript
   POST /auth/google
   Headers: {
     "Content-Type": "application/json",
     "User-Agent": "<browser-user-agent>"
   }
   Body: {
     code: "4/0AeanS...",  // Google authorization code
     redirectUri: "http://localhost:3000/auth/google/callback"
   }
   ```

4. **Backend Response (200 OK)**

   ```typescript
   {
     userId: 1,
     email: "user@gmail.com",
     tokens: {
       accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       expiresIn: 900,
       tokenType: "Bearer"
     },
     refreshToken: "uuid:randomTokenId"
   }
   ```

5. **Frontend stores tokens** (same as above)

6. **Handle errors**
   - `401 Unauthorized`: Invalid authorization code
   - `409 Conflict`: Email registered with different provider

---

## 4. Token Refresh Flow (`POST /auth/refresh`)

### Frontend Steps:

This is the **critical flow** that keeps users logged in automatically.

1. **Detect access token expiration**
   - Monitor token expiration time
   - Or catch `401 Unauthorized` responses from API calls

2. **Frontend sends refresh request**

   ```typescript
   POST /auth/refresh
   Headers: {
     "Content-Type": "application/json",
     "User-Agent": "<browser-user-agent>"
   }
   Body: {
     refreshToken: "uuid:randomTokenId"  // Previously stored refresh token
   }
   ```

3. **Backend validates refresh token**
   - Checks if token exists in database
   - Verifies token hash matches
   - Checks if token is revoked
   - Checks if token is expired
   - **Revokes old refresh token** (token rotation)

4. **Backend Response (200 OK)**

   ```typescript
   {
     userId: 1,
     email: "user@example.com",
     tokens: {
       accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // New token
       expiresIn: 900,
       tokenType: "Bearer"
     },
     refreshToken: "newUuid:newRandomTokenId"  // NEW refresh token!
   }
   ```

5. **Frontend updates tokens**
   - Replace old `accessToken` with new one
   - **CRITICAL**: Replace old `refreshToken` with new one
   - Update expiration time

6. **Handle errors**
   - `401 Unauthorized`: Invalid/expired/revoked refresh token
     - Clear all stored tokens
     - Redirect to login page

### Important Notes:

- **Token Rotation**: Every refresh generates a NEW refresh token
- **Old token is revoked**: Previous refresh token becomes invalid
- **Must update stored refresh token**: Or user will be logged out on next refresh

---

## 5. Authenticated API Requests

### Frontend Steps:

1. **Include access token in requests**

   ```typescript
   GET /api/users/me
   Headers: {
     "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "Content-Type": "application/json"
   }
   ```

2. **Handle token expiration**
   - If `401 Unauthorized` received:
     - Automatically call `/auth/refresh`
     - Retry original request with new token
   - If refresh fails:
     - Clear all tokens
     - Redirect to login

3. **Automatic refresh strategies**
   - **Proactive**: Refresh before expiration (e.g., 1 minute before)
   - **Reactive**: Refresh on 401 error (simpler, but may cause flicker)

---

## 6. Logout Flow (`POST /auth/logout`)

### Frontend Steps:

1. **Frontend sends logout request**

   ```typescript
   POST /auth/logout?all=false
   Headers: {
     "Authorization": "Bearer <accessToken>",
     "Content-Type": "application/json"
   }
   Body: {
     refreshToken: "uuid:randomTokenId"
   }
   ```

2. **Query parameters**
   - `?all=false`: Logout only this session
   - `?all=true`: Logout all sessions (revoke all refresh tokens)

3. **Backend Response (204 No Content)**

4. **Frontend cleanup**
   - Clear all stored tokens
   - Clear user state
   - Redirect to login page

5. **Handle errors**
   - `401 Unauthorized`: Invalid access token (already logged out)

---

## Frontend Implementation Patterns

### Token Storage Strategy

**Option 1: HTTP-Only Cookies (Recommended for web)**

```typescript
// Backend sets cookies automatically
// Frontend doesn't manage tokens directly
// More secure (XSS protection)
```

**Option 2: Memory + Secure Storage**

```typescript
// Access token: In-memory variable (cleared on page refresh)
// Refresh token: localStorage or sessionStorage
// Less secure but works for SPAs
```

**Option 3: Encrypted localStorage**

```typescript
// Encrypt tokens before storing
// Decrypt when needed
// Moderate security
```

### Automatic Token Refresh

```typescript
// Interceptor pattern (axios/fetch wrapper)
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        // Refresh token
        const { data } = await refreshToken();

        // Update stored tokens
        updateTokens(data.tokens.accessToken, data.refreshToken);

        // Retry original request
        error.config.headers.Authorization = `Bearer ${data.tokens.accessToken}`;
        return axios.request(error.config);
      } catch (refreshError) {
        // Refresh failed, logout
        logout();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);
```

### Proactive Refresh

```typescript
// Refresh token before expiration
const REFRESH_BUFFER = 60000; // 1 minute before expiration

setInterval(() => {
  const expiresAt = getTokenExpiration();
  const now = Date.now();

  if (expiresAt - now < REFRESH_BUFFER) {
    refreshToken();
  }
}, 30000); // Check every 30 seconds
```

---

## Security Considerations

1. **HTTPS Only**: Always use HTTPS in production
2. **Token Storage**: Never expose refresh tokens in URLs or logs
3. **CSRF Protection**: Use CSRF tokens for cookie-based auth
4. **XSS Prevention**: Sanitize inputs, use Content Security Policy
5. **Rate Limiting**: Backend limits requests (respect 429 responses)
6. **Token Rotation**: Always use new refresh token after refresh

---

## Token Lifetimes

- **Access Token**: ~15 minutes (900 seconds)
- **Refresh Token**: ~7 days (604800 seconds)

Tokens are stored in the `refresh_tokens` table with:

- UUID primary key
- Hashed token value
- Expiration timestamp
- Revocation flag
- User metadata (userAgent, ipAddress)

---

## Error Handling Summary

| Status Code           | Meaning               | Frontend Action                        |
| --------------------- | --------------------- | -------------------------------------- |
| 200 OK                | Success               | Process response                       |
| 201 Created           | Registration success  | Store tokens, redirect                 |
| 204 No Content        | Logout success        | Clear tokens, redirect                 |
| 400 Bad Request       | Validation error      | Show error message                     |
| 401 Unauthorized      | Invalid/expired token | Refresh or logout                      |
| 409 Conflict          | Email exists          | Show error, suggest login              |
| 429 Too Many Requests | Rate limited          | Show error, disable button temporarily |
