import {
  EncryptedRPCSession,
  EncryptedSession,
  EncryptedSessionMessageHub,
  IEncryptedMessage,
  IEncryptedRPCSessionConfig,
  ISyncRawMessageChannel,
  deserializePeerSessionConfig,
  serializePeerSessionConfig,
} from "safe-rpc";
function parsePeerConfigFromCfgString(cfgString: string): {
  serializedPeerSessionConfig: string;
  parentOrigin: string;
} {
  const lastBar = cfgString.indexOf("|");
  if (lastBar === -1) {
    throw new Error("missing separator between config and origin");
  }
  return {
    serializedPeerSessionConfig: cfgString.substring(0, lastBar),
    parentOrigin: cfgString.substring(lastBar + 1),
  };
}
class ChildToParentIFrameChannel implements ISyncRawMessageChannel {
  parentOrigin: string;
  disposed = false;
  callbacks: {
    eventCallback: (ev: MessageEvent) => any;
    encMessageCallback: (message: IEncryptedMessage) => void;
  }[] = [];

  constructor(parentOrigin: string) {
    this.parentOrigin = parentOrigin;
  }
  sendMessageRaw(message: IEncryptedMessage) {
    window.parent.postMessage(message, this.parentOrigin);
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
      if (ev.origin === this.parentOrigin) {
        try{
        callback(ev.data);
        }catch(err){
          console.error("ERROR in Event Callback: ",err);
        }
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
  }

  /*static async newChannel(parentOrigin: string, serializedPeerConfig: string): Promise<ChildToParentIFrameChannel> {

    return channel;
  }*/
}
class SafeRPCIFrameChild extends EncryptedSessionMessageHub {
  //@ts-ignore
  channel: ChildToParentIFrameChannel;
  constructor(
    session: EncryptedSession,
    channel: ChildToParentIFrameChannel,
    onMessageHandlerError: (error: Error) => any | null = (error: Error) =>
      console.error(error),
    onDecryptionError?: (error: Error) => any
  ) {
    super(session, channel, onMessageHandlerError, onDecryptionError);
    this.channel = channel;
  }

  static async createWithOriginAndSessionConfig(
    parentOrigin: string,
    serializedPeerSessionConfig: string,
    onMessageHandlerError: (error: Error) => any | null = (error: Error) =>
      console.error(error),
    onDecryptionError?: (error: Error) => any
  ): Promise<SafeRPCIFrameChild> {
    const deserializedPeerSessionInfo = deserializePeerSessionConfig(
      serializedPeerSessionConfig
    );
    const session = await EncryptedSession.fromPeerSessionInfo(
      deserializedPeerSessionInfo
    );
    const channel = new ChildToParentIFrameChannel(parentOrigin);
    const hub = new SafeRPCIFrameChild(
      session,
      channel,
      onMessageHandlerError,
      onDecryptionError
    );
    return hub;
  }

  static async create(
    settings: {
      parentOrigin?: string;
      serializedPeerSessionConfig?: string;
      onMessageHandlerError?: (error: Error) => any | null;
      onDecryptionError?: (error: Error) => any;
    } = {}
  ): Promise<SafeRPCIFrameChild> {
    if (settings.parentOrigin && settings.serializedPeerSessionConfig) {
      return SafeRPCIFrameChild.createWithOriginAndSessionConfig(
        settings.parentOrigin,
        settings.serializedPeerSessionConfig,
        settings.onMessageHandlerError,
        settings.onDecryptionError
      );
    } else {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) {
        throw new Error("missing peer session config in url hash");
      }
      const { parentOrigin, serializedPeerSessionConfig } =
        parsePeerConfigFromCfgString(decodeURIComponent(hash.substring(1)));
      return SafeRPCIFrameChild.createWithOriginAndSessionConfig(
        parentOrigin,
        serializedPeerSessionConfig,
        settings.onMessageHandlerError,
        settings.onDecryptionError
      );
    }
  }
  dispose(): void {
    super.dispose();
    this.channel.dispose();
  }
}

async function createChildIFrameRPCSession(
  settings: IEncryptedRPCSessionConfig & {
    parentOrigin?: string;
    serializedPeerSessionConfig?: string;
  } = {}
) {
  const hub = await SafeRPCIFrameChild.create(settings);
  const rpcSession = new EncryptedRPCSession(hub, settings.serializer);
  return rpcSession;
}

export {
  ChildToParentIFrameChannel,
  SafeRPCIFrameChild,
  createChildIFrameRPCSession,
};
