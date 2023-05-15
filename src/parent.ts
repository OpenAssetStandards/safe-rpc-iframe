import {
  EncryptedRPCSession,
  EncryptedSession,
  EncryptedSessionMessageHub,
  IEncryptedMessage,
  ISyncRawMessageChannel,
  serializePeerSessionConfig,
  IEncryptedRPCSessionConfig,
} from "safe-rpc";

function createChildIFrame(src: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.border = "none";
    iframe.style.outline = "none";
    iframe.style.top = "-2000px";
    iframe.style.left = "-2000px";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";

    iframe.onload = () => {
      //@ts-ignore
      iframe.onload = undefined;
      resolve(iframe);
    };
    iframe.onerror = (err) => {
      console.error("IFRAME ERROR: ", err);
      reject(err);
    };
    iframe.src = src;
    document.body.appendChild(iframe);
  });
}

class ParentToChildIFrameChannel implements ISyncRawMessageChannel {
  iframe: HTMLIFrameElement;
  childOrigin: string;
  disposed = false;
  callbacks: {
    eventCallback: (ev: MessageEvent) => any;
    encMessageCallback: (message: IEncryptedMessage) => void;
  }[] = [];

  constructor(iframe: HTMLIFrameElement, childOrigin: string) {
    this.iframe = iframe;
    this.childOrigin = childOrigin;
  }
  sendMessageRaw(message: IEncryptedMessage) {
    //@ts-ignore
    this.iframe.contentWindow.postMessage(message, this.childOrigin);
  }
  getEventCallback(
    encMessageCallback: (message: IEncryptedMessage) => void
  ): ((ev: MessageEvent) => any) | undefined {
    for (const cb of this.callbacks) {
      if (cb.encMessageCallback === encMessageCallback) {
        return cb.eventCallback;
      }
    }
  }
  addMessageListener(callback: (message: IEncryptedMessage) => void) {
    if (!!this.getEventCallback(callback)) {
      return;
    }
    const eventCallback = (ev: MessageEvent) => {
      if (ev.origin === this.childOrigin) {
        callback(ev.data);
      }
    };
    this.callbacks.push({ encMessageCallback: callback, eventCallback });
    window.addEventListener("message", eventCallback, false);
  }
  removeMessageListener(callback: (message: IEncryptedMessage) => void) {
    const eventCallback = this.getEventCallback(callback);
    if (eventCallback) {
      this.callbacks = this.callbacks.filter(
        (x) => x.encMessageCallback !== callback
      );
      window.removeEventListener("message", eventCallback, false);
    }
  }
  connect(config?: any) {
    return true;
  }
  canSendMessage(): boolean {
    return !this.disposed;
  }
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.callbacks.forEach((cb) => {
      window.removeEventListener("message", cb.eventCallback, false);
    });
    this.callbacks = [];
    document.body.removeChild(this.iframe);
  }

  static async newChannel(src: string): Promise<ParentToChildIFrameChannel> {
    const childFrame = await createChildIFrame(src);
    const childOrigin = new URL(src).origin;
    const channel = new ParentToChildIFrameChannel(childFrame, childOrigin);
    return channel;
  }
}
class SafeRPCIFrameParent extends EncryptedSessionMessageHub {

  //@ts-ignore
  channel: ParentToChildIFrameChannel;
  constructor(
    session: EncryptedSession,
    channel: ParentToChildIFrameChannel,
    onMessageHandlerError?: (error: Error) => any | null,
    onDecryptionError?: (error: Error) => any
  ) {
    super(session, channel, onMessageHandlerError, onDecryptionError);
    this.channel = channel;
  }

  static async create(
    childUrl: string,
    onMessageHandlerError?: (error: Error) => any | null,
    onDecryptionError?: (error: Error) => any
  ): Promise<SafeRPCIFrameParent> {
    const session = await EncryptedSession.newRandomSession();
    const peerSessionInfo = await session.generatePeerSessionConfig();
    const serializedPeerSessionInfo =
      serializePeerSessionConfig(peerSessionInfo);
    const encodedParams =
      "#" +
      encodeURIComponent(
        serializedPeerSessionInfo + "|" + window.location.origin
      );

    const realChildURL = childUrl + encodedParams;

    const channel = await ParentToChildIFrameChannel.newChannel(realChildURL);
    const hub = new SafeRPCIFrameParent(
      session,
      channel,
      onMessageHandlerError,
      onDecryptionError
    );
    return hub;
  }
  dispose(): void {
    super.dispose();
    this.channel.dispose();
  }
}

async function createParentIFrameRPCSession(
  childUrl: string,
  config: IEncryptedRPCSessionConfig = {}
): Promise<EncryptedRPCSession> {
  const hub = await SafeRPCIFrameParent.create(
    childUrl,
    config.onMessageHandlerError,
    config.onDecryptionError
  );
  const rpcSession = new EncryptedRPCSession(hub, config.serializer);
  return rpcSession;
}

export {
  ParentToChildIFrameChannel,
  SafeRPCIFrameParent,
  createParentIFrameRPCSession,
};
