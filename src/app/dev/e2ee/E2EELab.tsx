'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import {
  MatrixEventEvent,
  Preset,
  RoomEvent,
  Visibility,
} from 'matrix-js-sdk';

import type {
  MatrixClient,
  MatrixEvent,
  Room,
} from 'matrix-js-sdk';

const MATRIX_BASE_URL = 'http://localhost:8008';

const DEVICE_ID_STORAGE_PREFIX =
  'havensocial-e2ee-lab-device:';

type ConnectionInfo = {
  userId: string;
  deviceId: string;
};

type LabMessage = {
  id: string;
  sender: string;
  body: string;
};

type CryptoDiagnostic = {
  id: string;
  sender: string;
  eventType: string;
  encrypted: boolean;
  cleartextAvailable: boolean;
  wirePayloadContainsBody: boolean;
  payloadFields: string[];
};

export default function E2EELab() {
  const clientRef = useRef<MatrixClient | null>(null);
  const roomIdRef = useRef<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [storePassphrase, setStorePassphrase] = useState('');

  const [connection, setConnection] =
    useState<ConnectionInfo | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(
    'Not connected to the local Matrix server.',
  );

  const [inviteUserId, setInviteUserId] = useState(
    '@e2ee_bob:localhost',
  );

  const [roomIdInput, setRoomIdInput] = useState('');
  const [roomId, setRoomId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [cryptoDiagnostics, setCryptoDiagnostics] = useState<
    CryptoDiagnostic[]
  >([]);
  const [roomBusy, setRoomBusy] = useState(false);

  // Stop Matrix synchronisation when this page is unmounted.
  // This does not intentionally delete the IndexedDB crypto store.
  useEffect(() => {
    return () => {
      clientRef.current?.stopClient();
      clientRef.current = null;
    };
  }, []);

  // Display a message only after its content is available to this client.
  // For encrypted events, that means Rust Crypto has decrypted the event.
  function recordMessage(
    event: MatrixEvent,
    sourceRoomId: string,
  ) {
    if (
      !roomIdRef.current ||
      roomIdRef.current !== sourceRoomId
    ) {
      return;
    }

    const content =
      event.getClearContent() ??
      (event.isEncrypted() ? null : event.getContent());

    if (
      !content ||
      typeof content.body !== 'string' ||
      typeof content.msgtype !== 'string'
    ) {
      return;
    }

    const id =
      event.getId() ??
      `${sourceRoomId}-${event.getSender() ?? 'unknown'}-${event.getTs()}`;

    setMessages((previous) => {
      if (previous.some((item) => item.id === id)) {
        return previous;
      }

      return [
        ...previous,
        {
          id,
          sender: event.getSender() ?? 'Unknown sender',
          body: content.body,
        },
      ].slice(-30);
    });
  }

  // Inspect the MatrixEvent's original content separately from its
  // decrypted clear content. We show field names, never ciphertext itself.
  function recordCryptoDiagnostic(
    event: MatrixEvent,
    sourceRoomId: string,
  ) {
    if (
      !roomIdRef.current ||
      roomIdRef.current !== sourceRoomId
    ) {
      return;
    }

    const eventType = event.getType();
    const encrypted =
      eventType === 'm.room.encrypted' || event.isEncrypted();

    if (
      !encrypted &&
      eventType !== 'm.room.message'
    ) {
      return;
    }

    // getContent() is the event's original payload. For an encrypted
    // Matrix event it should contain ciphertext fields, not the message body.
    const wireContent = event.getContent();
    const clearContent = event.getClearContent();

    const id =
      event.getId() ??
      `${sourceRoomId}-${event.getSender() ?? 'unknown'}-${event.getTs()}`;

    const diagnostic: CryptoDiagnostic = {
      id,
      sender: event.getSender() ?? 'Unknown sender',
      eventType,
      encrypted,
      cleartextAvailable: clearContent !== null,
      wirePayloadContainsBody:
        typeof wireContent.body === 'string',
      payloadFields: Object.keys(wireContent ?? {}).sort(),
    };

    setCryptoDiagnostics((previous) => {
      const existingIndex = previous.findIndex(
        (item) => item.id === id,
      );

      if (existingIndex === -1) {
        return [...previous, diagnostic].slice(-30);
      }

      const updated = [...previous];
      updated[existingIndex] = diagnostic;
      return updated;
    });
  }

  async function connectToMatrix(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (connecting || clientRef.current) return;

    setConnecting(true);
    setError('');
    setConnection(null);
    setStatus('Connecting to the local Matrix server...');

    let authenticatedClient: MatrixClient | null = null;

    try {
      // This development lab must only operate on the local machine.
      if (
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      ) {
        throw new Error(
          'The E2EE development lab only works on localhost.',
        );
      }

      const normalizedUsername = username.trim();
      const normalizedPassword = password;
      const normalizedStorePassphrase = storePassphrase;

      if (
        !normalizedUsername ||
        !normalizedPassword ||
        normalizedStorePassphrase.length < 12
      ) {
        throw new Error(
          'Enter your Matrix username, password, and a local storage passphrase of at least 12 characters.',
        );
      }

      // Load the SDK in the browser, not during server rendering.
      const sdk = await import('matrix-js-sdk');

      const loginClient = sdk.createClient({
        baseUrl: MATRIX_BASE_URL,
      });

      // Each Matrix account has its own stable device key.
      // Separate Chrome profiles have separate localStorage.
      const deviceStorageKey =
        `${DEVICE_ID_STORAGE_PREFIX}${encodeURIComponent(
          normalizedUsername.toLowerCase(),
        )}`;

      const savedDeviceId =
        window.localStorage.getItem(deviceStorageKey);

      const login = await loginClient.login(
        'm.login.password',
        {
          user: normalizedUsername,
          password: normalizedPassword,
          ...(savedDeviceId
            ? { device_id: savedDeviceId }
            : {}),
          initial_device_display_name:
            'HavenSocial E2EE Development Lab',
        },
      );

      if (
        !login.user_id ||
        !login.device_id ||
        !login.access_token
      ) {
        throw new Error(
          'Matrix login did not return all required session details.',
        );
      }

      // Do not silently switch to a new device if we requested an old one.
      if (
        savedDeviceId &&
        login.device_id !== savedDeviceId
      ) {
        throw new Error(
          'Matrix returned a different device ID than expected. ' +
          'The existing cryptographic device has not been reused.',
        );
      }

      // Store only the device ID, never credentials or access tokens.
      window.localStorage.setItem(
        deviceStorageKey,
        login.device_id,
      );

      setStatus(
        'Matrix authentication successful. Initialising Rust Crypto...',
      );

      authenticatedClient = sdk.createClient({
        baseUrl: MATRIX_BASE_URL,
        userId: login.user_id,
        deviceId: login.device_id,
        accessToken: login.access_token,
      });

      clientRef.current = authenticatedClient;

      // Initialise Matrix Rust Crypto. Every account/device has its own store.
      await authenticatedClient.initRustCrypto({
        useIndexedDB: true,
        cryptoDatabasePrefix:
          `havensocial-e2ee-lab-${encodeURIComponent(login.user_id)}-${login.device_id}`,
        storagePassword: normalizedStorePassphrase,
      });

      if (!authenticatedClient.getCrypto()) {
        throw new Error(
          'Rust Crypto did not become available after initialisation.',
        );
      }

      setStatus(
        'Cryptographic engine initialised. Starting Matrix synchronisation...',
      );

      // Listen for timeline events. The timeline callback sees the
      // original event; the per-event listener updates diagnostics after
      // the SDK/Rust Crypto engine decrypts it.
      authenticatedClient.on(
        RoomEvent.Timeline,
        (
          timelineEvent: MatrixEvent,
          room: Room | undefined,
          toStartOfTimeline: boolean | undefined,
          removed: boolean,
        ) => {
          if (
            !room ||
            toStartOfTimeline ||
            removed
          ) {
            return;
          }

          const sourceRoomId = room.roomId;

          recordCryptoDiagnostic(timelineEvent, sourceRoomId);
          recordMessage(timelineEvent, sourceRoomId);

          timelineEvent.on(
            MatrixEventEvent.Decrypted,
            () => {
              recordCryptoDiagnostic(timelineEvent, sourceRoomId);
              recordMessage(timelineEvent, sourceRoomId);
            },
          );
        },
      );

      await authenticatedClient.startClient({
        initialSyncLimit: 10,
      });

      setConnection({
        userId: login.user_id,
        deviceId: login.device_id,
      });

      setStatus(
        'Rust Crypto initialised and Matrix synchronisation started. Ready for encrypted messaging.',
      );

      setPassword('');
      setStorePassphrase('');
    } catch (caught) {
      if (authenticatedClient) {
        try {
          await authenticatedClient.logout();
        } catch {
          authenticatedClient.stopClient();
        }

        clientRef.current = null;
      }

      const errorMessage =
        caught instanceof Error
          ? caught.message
          : 'An unexpected Matrix connection error occurred.';

      setError(errorMessage);
      setStatus('Connection failed.');
      setPassword('');
      setStorePassphrase('');
    } finally {
      setConnecting(false);
    }
  }

  // Log out of the Matrix session. This does not intentionally delete
  // the IndexedDB crypto store or the saved device ID.
  async function disconnect() {
    const client = clientRef.current;

    if (!client) return;

    setConnecting(true);
    setError('');

    try {
      await client.logout();
      setStatus('Logged out of the local Matrix session.');
    } catch (caught) {
      client.stopClient();
      setError(
        caught instanceof Error
          ? caught.message
          : 'Matrix logout could not be confirmed. Synchronisation was stopped locally.',
      );
      setStatus('Matrix synchronisation stopped locally.');
    } finally {
      client.stopClient();
      clientRef.current = null;
      roomIdRef.current = null;
      setConnection(null);
      setRoomId('');
      setRoomIdInput('');
      setMessages([]);
      setCryptoDiagnostics([]);
      setConnecting(false);
    }
  }

  // Alice creates a private encrypted room and invites Bob.
  async function createEncryptedRoom() {
    const client = clientRef.current;

    if (!client || roomBusy) return;

    setRoomBusy(true);
    setError('');

    try {
      const invitee = inviteUserId.trim();

      if (!/^@[^:\s]+:localhost$/.test(invitee)) {
        throw new Error(
          'Enter a valid local Matrix user ID, such as @e2ee_bob:localhost.',
        );
      }

      const result = await client.createRoom({
        visibility: Visibility.Private,
        preset: Preset.PrivateChat,
        is_direct: true,
        invite: [invitee],
        initial_state: [
          {
            type: 'm.room.encryption',
            state_key: '',
            content: {
              algorithm: 'm.megolm.v1.aes-sha2',
            },
          },
        ],
      });

      roomIdRef.current = result.room_id;
      setRoomId(result.room_id);
      setRoomIdInput(result.room_id);
      setMessages([]);
      setCryptoDiagnostics([]);
      setStatus(
        `Encrypted room created. Invitation sent to ${invitee}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not create the encrypted room.',
      );
    } finally {
      setRoomBusy(false);
    }
  }

  // Bob joins Alice's room using the room ID Alice shares.
  async function joinEncryptedRoom() {
    const client = clientRef.current;
    const targetRoomId = roomIdInput.trim();

    if (!client || roomBusy) return;

    // Matrix room IDs can be opaque and need not end in :localhost.
    if (!/^![^\s]+$/.test(targetRoomId)) {
      setError('Enter a valid Matrix room ID.');
      return;
    }

    setRoomBusy(true);
    setError('');

    try {
      await client.joinRoom(targetRoomId);

      roomIdRef.current = targetRoomId;
      setRoomId(targetRoomId);
      setMessages([]);
      setCryptoDiagnostics([]);
      setStatus('Joined the encrypted room successfully.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not join the room.',
      );
    } finally {
      setRoomBusy(false);
    }
  }

  // Send a message. Matrix JS SDK automatically encrypts it when
  // the destination room has encryption enabled.
  async function sendEncryptedMessage() {
    const client = clientRef.current;
    const targetRoomId = roomId.trim();
    const body = message.trim();

    if (
      !client ||
      !targetRoomId ||
      !body ||
      roomBusy
    ) {
      return;
    }

    setRoomBusy(true);
    setError('');

    try {
      const room = client.getRoom(targetRoomId);

      if (!room) {
        throw new Error(
          'The room is not available in this Matrix session. Check synchronisation and try again.',
        );
      }

      if (!room.hasEncryptionStateEvent()) {
        throw new Error(
          'This room does not have Matrix encryption enabled.',
        );
      }

      await client.sendTextMessage(targetRoomId, body);
      setMessage('');
      setStatus(
        'Message submitted to the encrypted Matrix room.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not send the encrypted message.',
      );
    } finally {
      setRoomBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    border: '1px solid var(--border, #475569)',
    background: 'var(--bg, #ffffff)',
    color: 'var(--text, #111827)',
    font: 'inherit',
    marginTop: 6,
  };

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    padding: 13,
    borderRadius: 10,
    border: 'none',
    background: '#2563EB',
    color: '#FFFFFF',
    fontWeight: 700,
    cursor:
      connecting || roomBusy
        ? 'not-allowed'
        : 'pointer',
    opacity:
      connecting || roomBusy
        ? 0.65
        : 1,
  };

  return (
    <section
      style={{
        border: '1px solid var(--border, #ddd)',
        borderRadius: 16,
        padding: 22,
        background: 'var(--surface, #ffffff)',
        color: 'var(--text, #111827)',
      }}
    >
      <div style={{ marginBottom: 22 }}>
        <span
          style={{
            display: 'inline-block',
            padding: '5px 10px',
            borderRadius: 20,
            background: 'rgba(37,99,235,0.12)',
            color: '#2563EB',
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          DEVELOPMENT ONLY
        </span>

        <h1 style={{ fontSize: 25, margin: '0 0 8px' }}>
          HavenSocial E2EE Lab
        </h1>

        <p
          style={{
            color: 'var(--text-muted, #777)',
            margin: 0,
          }}
        >
          Test Matrix authentication, persistent device identities,
          encrypted rooms and message decryption using your local
          Synapse server.
        </p>
      </div>

      <div
        style={{
          padding: 13,
          borderRadius: 10,
          background: 'var(--surface-secondary, #f1f5f9)',
          marginBottom: 20,
          fontSize: 13,
        }}
      >
        <strong>Matrix server:</strong> {MATRIX_BASE_URL}
        <br />
        <strong>Page access:</strong> Protected by BHID
        <br />
        <strong>Matrix test authentication:</strong> Separate local test account
        <br />
        <strong>Cryptographic engine:</strong> Matrix Rust Crypto
      </div>

      {connection ? (
        <div
          style={{
            padding: 16,
            border: '1px solid #16A34A',
            borderRadius: 12,
            background: 'rgba(22,163,74,0.07)',
            marginBottom: 18,
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>
            Cryptographic client initialised
          </h2>

          <p
            style={{
              fontSize: 14,
              overflowWrap: 'anywhere',
            }}
          >
            <strong>Matrix user:</strong>
            <br />
            {connection.userId}
          </p>

          <p
            style={{
              fontSize: 14,
              overflowWrap: 'anywhere',
            }}
          >
            <strong>Matrix device:</strong>
            <br />
            {connection.deviceId}
          </p>

          <p
            style={{
              color: '#15803D',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {status}
          </p>

          <div
            style={{
              borderTop: '1px solid var(--border, #ddd)',
              paddingTop: 20,
              marginTop: 20,
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              Encrypted room test
            </h3>

            <label
              style={{
                display: 'block',
                marginBottom: 12,
              }}
            >
              <strong>
                Invitee Matrix ID (Alice creates the room)
              </strong>

              <input
                type="text"
                value={inviteUserId}
                onChange={(event) =>
                  setInviteUserId(event.target.value)
                }
                style={inputStyle}
                disabled={roomBusy || connecting}
              />
            </label>

            <button
              type="button"
              onClick={() => void createEncryptedRoom()}
              disabled={roomBusy || connecting}
              style={buttonStyle}
            >
              Create encrypted room and invite Bob
            </button>

            <label
              style={{
                display: 'block',
                marginTop: 18,
              }}
            >
              <strong>Room ID</strong>

              <input
                type="text"
                value={roomIdInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setRoomIdInput(value);

                  if (value.trim() !== roomIdRef.current) {
                    roomIdRef.current = null;
                    setRoomId('');
                    setMessages([]);
                    setCryptoDiagnostics([]);
                  }
                }}
                placeholder="Paste Alice's room ID here"
                style={inputStyle}
                disabled={roomBusy || connecting}
              />
            </label>

            <button
              type="button"
              onClick={() => void joinEncryptedRoom()}
              disabled={roomBusy || connecting}
              style={{
                ...buttonStyle,
                marginTop: 10,
                background: '#15803D',
              }}
            >
              Join encrypted room
            </button>

            {roomId && (
              <p
                style={{
                  fontSize: 13,
                  overflowWrap: 'anywhere',
                  marginTop: 12,
                }}
              >
                <strong>Active room:</strong>
                <br />
                {roomId}
              </p>
            )}

            <label
              style={{
                display: 'block',
                marginTop: 18,
              }}
            >
              <strong>Test message</strong>

              <input
                type="text"
                value={message}
                onChange={(event) =>
                  setMessage(event.target.value)
                }
                placeholder="Type a message to encrypt..."
                style={inputStyle}
                disabled={
                  roomBusy ||
                  connecting ||
                  !roomId
                }
              />
            </label>

            <button
              type="button"
              onClick={() => void sendEncryptedMessage()}
              disabled={
                roomBusy ||
                connecting ||
                !roomId ||
                !message.trim()
              }
              style={{
                ...buttonStyle,
                marginTop: 10,
              }}
            >
              Send encrypted message
            </button>

            <h3 style={{ marginTop: 24 }}>
              Received messages
            </h3>

            {messages.length === 0 ? (
              <p style={{ fontSize: 14 }}>
                No decrypted messages received yet.
              </p>
            ) : (
              <div style={{ overflowWrap: 'anywhere' }}>
                {messages.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--border, #ddd)',
                      borderRadius: 9,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <strong>{item.sender}</strong>
                    <p style={{ marginBottom: 0 }}>
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <h3 style={{ marginTop: 24 }}>
              Encryption Diagnostics
            </h3>

            <p
              style={{
                fontSize: 13,
                color: 'var(--text-muted, #777)',
              }}
            >
              These diagnostics inspect the Matrix event received by this
              browser. For encrypted messages, the original event should
              contain ciphertext fields while the SDK exposes readable
              content separately after decryption. Ciphertext itself is
              deliberately not displayed.
            </p>

            {cryptoDiagnostics.length === 0 ? (
              <p style={{ fontSize: 14 }}>
                No Matrix message events inspected yet. Send a new message
                after both devices have joined the room.
              </p>
            ) : (
              <div style={{ overflowWrap: 'anywhere' }}>
                {cryptoDiagnostics.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--border, #ddd)',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                      fontSize: 13,
                    }}
                  >
                    <strong>{item.sender}</strong>

                    <p>
                      Original Matrix event type:{' '}
                      <strong>{item.eventType}</strong>
                    </p>

                    <p>
                      Encrypted event:{' '}
                      <strong>{item.encrypted ? 'YES' : 'NO'}</strong>
                    </p>

                    <p>
                      Decrypted in this browser:{' '}
                      <strong>
                        {item.cleartextAvailable
                          ? 'YES'
                          : item.encrypted
                            ? 'NOT AVAILABLE (pending or failed)'
                            : 'NOT APPLICABLE'}
                      </strong>
                    </p>

                    <p>
                      Readable message body in original event payload:{' '}
                      <strong>
                        {item.wirePayloadContainsBody ? 'YES' : 'NO'}
                      </strong>
                    </p>

                    <p>
                      Original event payload fields:{' '}
                      <code>
                        {item.payloadFields.join(', ') || 'None'}
                      </code>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={connecting || roomBusy}
            style={{
              ...buttonStyle,
              background: '#DC2626',
              marginTop: 20,
            }}
          >
            {connecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      ) : (
        <form onSubmit={connectToMatrix}>
          <label
            style={{
              display: 'block',
              marginBottom: 15,
            }}
          >
            <strong>Matrix username</strong>

            <input
              type="text"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              placeholder="e2ee_alice"
              autoComplete="username"
              required
              disabled={connecting}
              style={inputStyle}
            />
          </label>

          <label
            style={{
              display: 'block',
              marginBottom: 15,
            }}
          >
            <strong>Matrix account password</strong>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              autoComplete="current-password"
              required
              disabled={connecting}
              style={inputStyle}
            />
          </label>

          <label
            style={{
              display: 'block',
              marginBottom: 18,
            }}
          >
            <strong>Local crypto-storage passphrase</strong>

            <input
              type="password"
              value={storePassphrase}
              onChange={(event) =>
                setStorePassphrase(event.target.value)
              }
              autoComplete="new-password"
              minLength={12}
              required
              disabled={connecting}
              style={inputStyle}
            />

            <small
              style={{
                display: 'block',
                color: 'var(--text-muted, #777)',
                marginTop: 6,
              }}
            >
              Use the same development-only passphrase previously created
              for this Matrix device. It protects the local IndexedDB
              crypto store and is not your Matrix or BHID password.
            </small>
          </label>

          <button
            type="submit"
            disabled={connecting}
            style={buttonStyle}
          >
            {connecting
              ? 'Connecting and initialising encryption...'
              : 'Connect and initialise Rust Crypto'}
          </button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          style={{
            padding: 12,
            borderRadius: 10,
            background: 'rgba(220,38,38,0.09)',
            color: '#DC2626',
            overflowWrap: 'anywhere',
          }}
        >
          {error}
        </p>
      )}

      <p
        role="status"
        style={{
          marginTop: 18,
          fontSize: 13,
          color: 'var(--text-muted, #777)',
          overflowWrap: 'anywhere',
        }}
      >
        <strong>Status:</strong> {status}
      </p>

      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: 'var(--text-muted, #777)',
        }}
      >
        This page is restricted to local development and requires BHID
        authentication to access the page. Matrix test credentials are
        separately sent from your browser to your local Synapse server.
        Never enter your production BHID password here.
      </p>
    </section>
  );
}
