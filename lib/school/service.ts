// Service layer entry point: every function takes a verified Ctx (see svc-core.loadCtx) and works against
// Supabase or the in-memory demo store through the SchoolDb interface.
export * from "./svc-core";
export * from "./svc-people";
export * from "./svc-attendance";
export * from "./svc-grades";
export * from "./svc-analytics";
export * from "./svc-comms";
export * from "./svc-import";
export * from "./svc-prefs";
export * from "./svc-family";
