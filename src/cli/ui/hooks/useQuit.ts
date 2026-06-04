import type { WriteStream } from "node:fs";
import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { stopAndSaveCpuProfile } from "../../cpu-prof.js";

// Ctrl+C / SIGINT → flush transcript + (if profiling) save .cpuprofile, then exit.
// Uses process.exit() directly — Ink's exit() leaves the stdin listener alive.
// A process.on("exit") fallback fires onBeforeExit on SIGTERM/SIGHUP/natural exit.
export function useQuit(
  transcriptRef: MutableRefObject<WriteStream | null>,
  onBeforeExit?: () => void,
): () => void {
  // Ref mirror so the exit listener always calls the latest callback
  // without needing onBeforeExit in its deps (process listeners are
  // never re-registered, unlike the SIGINT handler).
  const onBeforeExitRef = useRef(onBeforeExit);
  onBeforeExitRef.current = onBeforeExit;

  const quitProcess = useCallback(() => {
    transcriptRef.current?.end();
    onBeforeExit?.();
    void (async () => {
      await stopAndSaveCpuProfile();
      process.exit(0);
    })();
  }, [transcriptRef, onBeforeExit]);

  // SIGINT: explicit Ctrl+C → clean exit
  useEffect(() => {
    process.on("SIGINT", quitProcess);
    return () => {
      process.off("SIGINT", quitProcess);
    };
  }, [quitProcess]);

  // Last-resort fallback: any process.exit() path (SIGTERM, SIGHUP,
  // unhandled rejection, --once mode, etc.) still flushes telemetry
  // and clears the store. The exit event only permits synchronous
  // work — formatSummary() + stderr.write() + store.clear() are all
  // sync, so this is safe.
  useEffect(() => {
    const onExit = () => {
      onBeforeExitRef.current?.();
    };
    process.on("exit", onExit);
    return () => {
      process.off("exit", onExit);
    };
  }, []);

  return quitProcess;
}
