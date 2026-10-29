# AGENTS.md
- The edUloc Android app is the system of record; this site never duplicates tutor/booking logic. Why: brief forbids a second management system.
- All contact channels, APK URL and future agent-console endpoint live in src/config/eduloc.ts; UI hides channels whose value is empty. Why: no fake contact info may be shown.
- Help requests are stored in the support_requests table (anon insert-only, status column for a future agent console). Why: requests must really be recorded, never simulated.
