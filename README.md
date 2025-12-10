# TL;DR Backend

Backend service for the **TL;DR** email management platform with Gmail integration, AI-powered features, and intelligent email workflows.

---

## ✨ Key Features

### Email Management

- **Gmail API Integration**: Full Gmail API support for reading, sending, and managing emails
- **OAuth 2.0 with PKCE**: Secure Google authentication with encrypted token storage
- **Email Synchronization**: Real-time email sync with Gmail History API
- **Background Jobs**: Automated cron jobs for periodic synchronization
- **Email Threading**: Proper threading with In-Reply-To and References headers
- **Attachment Support**: Full attachment metadata and download capabilities

### AI-Powered Features

- **Email Summarization**: AI-generated summaries using Gemini API
- **Smart Insights**: Automatic summary generation for incoming emails
- **Bulk Summarization**: Efficiently summarize multiple emails

### Workflow Management

- **Task Status Tracking**: 4-state workflow (none, todo, in_progress, done)
- **Email Snooze**: Snooze emails with custom timestamps
- **Auto Wake-up**: Cron job automatically unsnoozes emails when time expires
- **Email Categories**: Gmail category support (primary, social, promotions, etc.)

### Security & Performance

- **AES-256-GCM Encryption**: Encrypted OAuth token storage
- **JWT Authentication**: Secure access and refresh token management
- **Rate Limiting**: ThrottleGuard with configurable limits
- **Database Indexing**: Optimized queries with strategic indexes
- **Pagination**: Efficient cursor-based pagination

---

## Getting Started

### Option 1: Docker Compose (Recommended)

#### 1. Clone the repo

```bash
git clone https://github.com/Diploma-Survivors/tldr-backend
cd tldr-backend
```

#### 2. Copy env file

```bash
cp env.example .env
```

#### 3. Update .env with your values

Edit `.env` to configure database, Redis, Google OAuth, and AI service settings:

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=tldr_email

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Gemini AI (for email summarization)
GEMINI_API_KEY=your-gemini-api-key

# Encryption (for OAuth tokens)
ENCRYPTION_KEY=your-32-character-encryption-key-here

# App
PORT=3000
NODE_ENV=development
```

#### 4. Start infrastructure

```bash
docker compose up -d
```

#### 5. Install dependencies

```bash
npm install
```

#### 6. Start the application

```bash
npm run start:dev
```

### Option 2: Manual Setup

1. Install **PostgreSQL** and **Redis** locally.
2. Create a database named `tldr`:
   ```bash
   createdb tldr
   ```
3. Copy `.env` from `env.example` and update credentials.
4. Install dependencies:
   ```bash
   npm install
   ```
5. Run the application:
   ```bash
   npm run start:dev
   ```

---

## API Documentation

Available at:
👉 [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

---

## Scripts

- `npm run start:dev` → Run in development with hot-reload
- `npm run start:prod` → Run in production
- `npm run build` → Compile the application to `/dist`
- `npm run test` → Run unit tests with Jest
- `npm run test:e2e` → Run end-to-end tests
- `npm run lint` → Run ESLint to check code style
- `npm run format` → Run Prettier to format code

---

## Database & Migrations

- **Development**: Auto-sync enabled via TypeORM for schema updates.
- **Production**: Use migrations for controlled schema changes.

### Migration Commands

```bash
# Generate a new migration
npm run typeorm:generate -- -n MigrationName

# Run migrations
npm run typeorm:run

# Revert the last migration
npm run typeorm:revert
```

---

## Development Guidelines

- Use **NestJS Logger** instead of `console.log` for consistent logging.
- Follow coding standards enforced by **ESLint** and **Prettier**.
- **Commit messages** must follow the [Conventional Commit](https://www.conventionalcommits.org/) format:
  - `feat: add user auth`
  - `fix: resolve login bug`
  - `chore: update dependencies`

- Always create a branch for your work:
  - `feature/*` → new features
  - `fix/*` → bug fixes
  - `chore/*` → maintenance tasks

- All changes must go through a **Pull Request** with at least **one reviewer approval**.
- Generate new services/resources using the NestJS CLI:

  ```bash
  nest g resource <service-name>
  ```

- All services must live under the `src/modules` folder.

---

## Workflow: Trunk-Based Development

1. Create a feature branch:
   ```bash
   git checkout -b feature/awesome-feature
   ```
2. Commit changes and push:
   ```bash
   git commit -m "feat: implement awesome feature"
   git push origin feature/awesome-feature
   ```
3. Open a Pull Request on GitHub.
4. Request review and ensure CI checks (tests, linting) pass.
5. Merge into the `main` branch after approval.

---

## Notes for Team

- **Dependency Management**: Keep dependencies up to date using `npm outdated` and update as needed.
- **API Documentation**: Update Swagger annotations for any API changes to keep [http://localhost:3000/api/docs](http://localhost:3000/api/docs) current.
- **Environment Variables**: Add new variables to `env.example` when updating `.env` requirements.
- **Logging**: Use structured logging (e.g., JSON format) for better observability in production.
- **Testing**: Write unit and end-to-end tests for all new features and bug fixes.
- **Security**: Ensure sensitive data (e.g., API keys, credentials) is stored in `.env` and never committed.

---

## Troubleshooting

- **Database Connection Issues**: Verify PostgreSQL is running and `.env` credentials match.
- **Redis Connection Errors**: Ensure Redis is accessible and the port in `.env` is correct.
- **Dependency Issues**: Run `npm ci` for a clean install if `npm install` fails.
- **Migration Conflicts**: Check migration history with `npm run typeorm:log` and resolve conflicts manually.
