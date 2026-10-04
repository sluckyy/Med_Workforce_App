import net from "node:net";

// Talks to clamd directly over its local unix socket using the INSTREAM
// protocol (docs.clamav.net/manual/Usage/Scanning.html#stream-scanning)
// rather than shelling out to clamdscan or depending on an npm wrapper —
// the protocol is a handful of lines of code, and this is security-
// sensitive enough that we'd rather own it than depend on a wrapper
// package's maintenance. clamd itself runs as a background process in
// this same container (see docker/start.sh, docker/clamd.conf).
const CLAMD_SOCKET_PATH = process.env.CLAMD_SOCKET_PATH ?? "/run/clamav/clamd.ctl";
const SCAN_TIMEOUT_MS = 15_000;

export type ScanOutcome =
  | { status: "CLEAN" }
  | { status: "QUARANTINED"; signature: string }
  // The scanner was unreachable or gave an unparseable response. Never
  // conflated with CLEAN — "not yet scanned" and "scanned and safe" are
  // different claims, same invariant this codebase applies everywhere
  // else a check's absence must not be read as a pass (eligibility
  // evaluators, fatigue checks, moratorium status).
  | { status: "PENDING"; reason: string };

export async function scanBuffer(buffer: Buffer): Promise<ScanOutcome> {
  let response: string;
  try {
    response = await instream(buffer);
  } catch (err) {
    return { status: "PENDING", reason: err instanceof Error ? err.message : "scanner unavailable" };
  }

  // clamd's INSTREAM response is one line: "stream: OK" | "stream: <Virus
  // Name> FOUND" | "stream: <message> ERROR".
  const foundMatch = response.match(/stream:\s*(.+?)\s+FOUND/);
  if (foundMatch) {
    return { status: "QUARANTINED", signature: foundMatch[1] };
  }
  if (response.includes("OK")) {
    return { status: "CLEAN" };
  }
  return { status: "PENDING", reason: response || "unexpected scanner response" };
}

function instream(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: CLAMD_SOCKET_PATH });
    let response = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("clamd scan timed out"));
    }, SCAN_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const chunkSizeHeader = Buffer.alloc(4);
      chunkSizeHeader.writeUInt32BE(buffer.length, 0);
      socket.write(chunkSizeHeader);
      socket.write(buffer);
      socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("end", () => {
      clearTimeout(timer);
      resolve(response.trim());
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
