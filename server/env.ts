// Load settings from a .env file (if there is one) before anything else reads them.
// .env holds ANTHROPIC_API_KEY and is listed in .gitignore, so the key never reaches GitHub.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: fine. The app still works with the saved sample results.
}
