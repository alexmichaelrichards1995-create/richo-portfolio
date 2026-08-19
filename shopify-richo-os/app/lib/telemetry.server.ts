export type TelemetryLevel = "info" | "warn" | "error";

export function emitTelemetry(level: TelemetryLevel, event: string, data: Record<string, unknown> = {}) {
  const record = {
    ts: new Date().toISOString(),
    service: "richo-shopify-os",
    level,
    event,
    ...data,
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
  return record;
}
