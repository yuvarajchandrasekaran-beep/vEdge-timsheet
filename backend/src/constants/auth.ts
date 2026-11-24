// The password every new account starts with (routes/users.ts), until it is changed. There is no
// way yet to change it in the app, so where password sign-in is restricted (PASSWORD_LOGIN_ENABLED
// =false) it is never accepted, even for an account allowed to sign in with a password.
export const DEFAULT_PASSWORD = "Password123!";
