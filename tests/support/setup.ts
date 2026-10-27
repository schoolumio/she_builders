// Runs in every test worker before test files are imported.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://prayer:prayer@localhost:5432/prayer_test?schema=public";
process.env.APP_URL = "http://localhost:3000";
process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.PAYMENTS_SIMULATOR_SECRET = "test-simulator-secret";
process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_secret";
process.env.EMAIL_DRIVER = "log";
process.env.BILLING_PROVIDER = "none";
delete process.env.LIVEKIT_URL;
delete process.env.STRIPE_SECRET_KEY;
