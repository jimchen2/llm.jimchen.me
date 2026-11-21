// lib/testMode.js
//
// Test mode is switched on with TEST_MODE=true in the server environment. While
// it is on, the app needs no password and loads a few sample conversations.
// Keep this file free of imports so it can be used anywhere (including
// middleware); the seeding logic lives in lib/testSeed.js.
export function isTestMode() {
  return process.env.TEST_MODE === 'true';
}
