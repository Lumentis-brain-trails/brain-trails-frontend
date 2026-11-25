/**
 * One end of a live room (backend `docs/api/live-protocol.md`, V4-0003; T5).
 *
 * The socket goes straight to the API's public host (`GET /config` -> `live_url`): a
 * WebSocket cannot pass through the Vercel BFF. Each connection asks for a fresh
 * 5-minute ticket, so a reconnect an hour into a session works like the first one.
 * A drop reconnects with capped exponential backoff and jitter; only a refusal that
 * another try cannot change (the session finished, live is off, too many rooms) stops
 * it. A ticket is retried the same way only when it failed in transit or on the server
 * (a network error, a 5xx): a 4xx is the API saying no, and asking again every 15 s
 * would be periodic database traffic that keeps Neon awake (backend 0014). What a
 * reconnect must re-send is the caller's business: the producer re-sends the chunks
 * the room did not keep, an observer resumes from the stream ids it last saw.
 */

import { ApiRequestError } from "@/lib/api";

export type SocketState = "connecting" | "open" | "reconnecting" | "closed";

/** Any frame of the protocol; `type` says which. */
export type LiveFrame = { type?: string; id?: string } & Record<
  string,
  unknown
>;

export interface Ticket {
  ticket: string;
  ws_path: string;
}

/**
 * Close codes after which trying again would be refused the same way: a bad ticket,
 * live off, the session finished, 4423 - another tab of the same person (or another
 * person) holds the room as producer - and 4429, too many rooms active: the run goes on
 * without its live copy. `4408` is not one of them: the gateway asks an observer to come
 * back with a fresh ticket every 15 minutes, which the next connection does by itself.
 */
export const FINAL_CLOSE_CODES = new Set([4401, 4404, 4409, 4423, 4429]);

/**
 * A ticket the caller knows will not come however often it asks (a waiting room that
 * answered `open: false`): thrown from `ticket`, it stops the socket like a 4xx.
 */
export class TicketRefused extends Error {}

/**
 * Whether a failure to get a ticket is final: a `TicketRefused`, or any 4xx from the API
 * (403 not yours, 404 no room, 409 closed...) except 408 and 429, which say "later".
 * A network error or a 5xx is not: those are retried with backoff.
 */
export function isFinalTicketError(error: unknown): boolean {
  if (error instanceof TicketRefused) return true;
  if (!(error instanceof ApiRequestError)) return false;
  const { status } = error;
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Milliseconds to wait before attempt `n` (0-based): 0.5 s doubling to 15 s, +-20 %. */
export function backoffMs(attempt: number, random: () => number = Math.random) {
  const base = Math.min(15_000, 500 * 2 ** attempt);
  return Math.round(base * (0.8 + 0.4 * random()));
}

/** `wss://host/path` from the API's `https://host`. */
export function wsUrl(base: string, path: string): string {
  return base.replace(/\/$/, "").replace(/^http/, "ws") + path;
}

export interface LiveSocketOptions {
  baseUrl: string;
  /** A fresh ticket, asked for before every connection. */
  ticket: () => Promise<Ticket>;
  /** Extra fields of the first frame, read at each connection (an observer's `since`). */
  hello?: () => Record<string, unknown>;
  onFrame: (frame: LiveFrame) => void;
  /**
   * Every change of state. With `closed`, `code` is the close code that ended it, and
   * absent when a ticket was refused (the error went through `ticket`) or `close` ran.
   */
  onState?: (state: SocketState, code?: number) => void;
  /** For tests. */
  WebSocketImpl?: typeof WebSocket;
  backoff?: (attempt: number) => number;
}

export class LiveSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  state: SocketState = "connecting";

  constructor(private readonly options: LiveSocketOptions) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  /** Send a frame now; false (and dropped) when the socket is not open. */
  send(frame: LiveFrame): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(frame));
    return true;
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close(1000);
    this.ws = null;
    this.setState("closed");
  }

  private setState(state: SocketState, code?: number) {
    this.state = state;
    this.options.onState?.(state, code);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    let ticket: Ticket;
    try {
      ticket = await this.options.ticket();
    } catch (e) {
      if (this.stopped) return;
      if (isFinalTicketError(e)) {
        this.stopped = true;
        this.setState("closed");
        return;
      }
      this.retry();
      return;
    }
    if (this.stopped) return;
    const Impl = this.options.WebSocketImpl ?? WebSocket;
    const ws = new Impl(wsUrl(this.options.baseUrl, ticket.ws_path));
    this.ws = ws;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({ ticket: ticket.ticket, ...this.options.hello?.() })
      );
    };
    ws.onmessage = (event: MessageEvent) => {
      let frame: LiveFrame;
      try {
        frame = JSON.parse(String(event.data)) as LiveFrame;
      } catch {
        return;
      }
      if (frame.type === "hello") {
        this.attempt = 0;
        this.setState("open");
      }
      this.options.onFrame(frame);
    };
    ws.onclose = (event: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (FINAL_CLOSE_CODES.has(event.code) || event.code === 1000) {
        this.stopped = true;
        this.setState("closed", event.code);
        return;
      }
      this.retry();
    };
  }

  private retry() {
    if (this.stopped) return;
    this.setState("reconnecting");
    const wait = (this.options.backoff ?? backoffMs)(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => void this.connect(), wait);
  }
}
