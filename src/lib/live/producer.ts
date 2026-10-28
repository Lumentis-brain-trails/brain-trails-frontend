/**
 * The participant's side of a live room (T5): the signal, the plan, the runner's state
 * and its events go out; commands come in.
 *
 * Everything here is a copy: the run records locally and uploads at finish whatever
 * happens to this socket (V3-0005). A chunk is kept for `RESEND_CHUNKS` seconds, so a
 * reconnect (the gateway restarting, the line dropping) re-sends what the room did not
 * keep - the room says its last `seq` in `hello` and drops anything at or below it.
 *
 * Commands arrive as a `CommandPort` for the runner, which logs each one; with "pause
 * when I lose sight" on, the last observer leaving makes the run pause itself (a `pause`
 * with source `auto`, deferred to the block's end like any pause).
 */

import { api } from "@/lib/api";
import type { EegChannel } from "@/lib/muse/protocol";
import {
  type CommandPort,
  type LocalCommandPort,
  type OperatorCommand,
  createLocalCommandPort,
  makeCommand,
  operatorCommandSchema,
} from "@/lib/protocol/commands";
import type { Marker } from "@/lib/protocol/marker";
import { ChunkAssembler, type LiveChunk } from "./chunks";
import {
  type LiveFrame,
  LiveSocket,
  type SocketState,
  type Ticket,
} from "./socket";

/** Seconds of signal kept for a re-send after a reconnect. */
export const RESEND_CHUNKS = 120;

export interface Presence {
  observers: number;
  pauseOnLostSight: boolean;
}

export interface LiveProducerOptions {
  sessionId: string;
  baseUrl: string;
  sfreq?: number;
  onPresence?: (presence: Presence) => void;
  onState?: (state: SocketState) => void;
  /** For tests. */
  WebSocketImpl?: typeof WebSocket;
  ticket?: () => Promise<Ticket>;
}

export class LiveProducer {
  private readonly socket: LiveSocket;
  private readonly assembler: ChunkAssembler;
  private readonly sent: LiveChunk[] = [];
  private readonly port: LocalCommandPort = createLocalCommandPort();
  private plan: unknown = null;
  private runner: unknown = null;
  private observers = 0;
  private ended = false;

  constructor(private readonly options: LiveProducerOptions) {
    this.assembler = new ChunkAssembler(options.sfreq ?? 256);
    this.socket = new LiveSocket({
      baseUrl: options.baseUrl,
      ticket:
        options.ticket ??
        (() =>
          api.post<Ticket>(
            `sessions/${options.sessionId}/live/producer-ticket`,
            {}
          )),
      onFrame: (frame) => this.onFrame(frame),
      onState: (state) => options.onState?.(state),
      WebSocketImpl: options.WebSocketImpl,
    });
  }

  /** Commands for the runner: what the observer holding them sends. */
  get commands(): CommandPort {
    return this.port;
  }

  start(): void {
    this.ended = false;
    this.socket.start();
  }

  /** One headband packet of one channel. */
  pushEeg(
    channel: EegChannel,
    sampleIndex: number,
    samples: ArrayLike<number>
  ) {
    if (this.ended) return;
    for (const chunk of this.assembler.push(channel, sampleIndex, samples)) {
      this.sent.push(chunk);
      if (this.sent.length > RESEND_CHUNKS) this.sent.shift();
      this.socket.send(chunk as unknown as LiveFrame);
    }
  }

  setPlan(plan: unknown): void {
    this.plan = plan;
    this.socket.send({ type: "plan", plan });
  }

  setState(state: unknown): void {
    this.runner = state;
    this.socket.send({ type: "state", state });
  }

  /** A marker of the run: commands are acknowledged by their `operator_command` markers. */
  marker(marker: Marker): void {
    this.socket.send({
      type: "event",
      event: {
        label: marker.label,
        kind: marker.kind,
        tSessionS: marker.tSessionS,
        seq: marker.seq,
        meta: marker.meta,
      },
    });
  }

  /** A block's own result, for the console's measures as they arrive. */
  blockResult(result: { stepId: string; taskKind: string; summary: unknown }) {
    this.socket.send({
      type: "event",
      event: { kind: "block_result", ...result },
    });
  }

  quality(quality: Record<string, unknown>): void {
    this.socket.send({ type: "quality", quality });
  }

  /** The run is over: say so, then let go of the socket. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.socket.send({ type: "end" });
    setTimeout(() => this.socket.close(), 500);
  }

  /** Whether `end` was said (or the producer closed). */
  get finished(): boolean {
    return this.ended;
  }

  close(): void {
    this.ended = true;
    this.socket.close();
  }

  private onFrame(frame: LiveFrame) {
    if (frame.type === "hello") {
      const last = typeof frame.last_seq === "number" ? frame.last_seq : -1;
      for (const chunk of this.sent)
        if (chunk.seq > last) this.socket.send(chunk as unknown as LiveFrame);
      if (this.plan !== null)
        this.socket.send({ type: "plan", plan: this.plan });
      if (this.runner !== null)
        this.socket.send({ type: "state", state: this.runner });
      this.presence(frame);
    } else if (frame.type === "presence") {
      this.presence(frame);
    } else if (frame.type === "command") {
      const parsed = operatorCommandSchema.safeParse({
        ...(frame.command as object),
        source: "remote",
      });
      if (parsed.success) this.port.send(parsed.data);
    }
  }

  private presence(frame: LiveFrame) {
    const observers = Number(frame.observers ?? 0);
    const pauseOnLostSight = frame.pause_on_lost_sight === true;
    if (this.observers > 0 && observers === 0 && pauseOnLostSight)
      this.port.send(
        makeCommand("pause", "lost sight", "auto") as OperatorCommand
      );
    this.observers = observers;
    this.options.onPresence?.({ observers, pauseOnLostSight });
  }
}
