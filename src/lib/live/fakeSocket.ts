/** A WebSocket stand-in for the live tests: records what is sent, plays frames in. */

export class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.all.push(this);
  }

  static reset() {
    FakeSocket.all = [];
  }

  static last(): FakeSocket {
    const socket = FakeSocket.all.at(-1);
    if (!socket) throw new Error("no socket opened");
    return socket;
  }

  open() {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(frame: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  send(text: string) {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }

  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  /** The server side dropping the socket. */
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}
