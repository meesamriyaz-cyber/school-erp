# School ERP Mobile

Expo SDK 57 / React Native 0.86 / JavaScript / Expo Router.

## API configuration

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL`.

- Android emulator: `http://10.0.2.2:5000/api/v1`
- Physical device: use the host machine's LAN IP and ensure the API is reachable from the device.
- Production: use the HTTPS API origin.

Start the app from the monorepo root:

```sh
pnpm --filter @school-erp/mobile start
```

## Authentication

School accounts sign in with school slug, email and password. Platform administrators use the global email/password account mode.

Refresh tokens are stored using Expo SecureStore. Access tokens remain in memory. The API client refreshes the session after a 401 and retries the request once. Logout revokes the server session when possible and always clears local credentials.

Do not commit real environment values or credentials.
