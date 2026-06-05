// Centralised API base URL for all fetch calls.
// In development this falls back to localhost:5001.
// In production, set NEXT_PUBLIC_API_BASE_URL in your Vercel project env vars.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';
