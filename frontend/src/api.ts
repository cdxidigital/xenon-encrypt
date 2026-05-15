const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.replace(/\/$/, '');

type JsonBody = object;

export interface Identity {
  id: string;
  xid: string;
  name: string;
  avatar_seed: string;
  public_key: string;
  disposable: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  owner_xid: string;
  peer_xid: string;
  peer_name: string;
  verified: boolean;
  trust_score: number;
  fingerprint: string;
  created_at: string;
}

export type ChatType = 'direct' | 'group' | 'broadcast';

export interface Chat {
  id: string;
  type: ChatType;
  name?: string | null;
  participant_xids: string[];
  created_by_xid: string;
  vault: boolean;
  ghost: boolean;
  burn_seconds?: number | null;
  decoy: boolean;
  last_message_preview?: string | null;
  last_sender_xid?: string | null;
  last_message_at?: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_xid: string;
  ciphertext: string;
  content_type: 'text' | 'image' | 'audio' | 'file';
  attachment_data?: string | null;
  attachment_name?: string | null;
  self_destruct_seconds?: number | null;
  destroyed: boolean;
  delivered: boolean;
  read_by: string[];
  created_at: string;
}

interface CreateChatPayload {
  type: ChatType;
  name?: string;
  participant_xids: string[];
  created_by_xid: string;
}

interface UpdateChatPayload {
  vault?: boolean;
  ghost?: boolean;
  burn_seconds?: number | null;
  decoy?: boolean;
  name?: string;
}

interface SendMessagePayload {
  chat_id: string;
  sender_xid: string;
  ciphertext: string;
  content_type?: Message['content_type'];
  attachment_data?: string;
  attachment_name?: string;
  self_destruct_seconds?: number;
}

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_BACKEND_URL is not configured');
  }
  return `${API_BASE_URL}/api${path}`;
}

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export const api = {
  createIdentity: (name: string, disposable = false) =>
    request<Identity>('POST', '/identities', { name, disposable }),
  listIdentities: () => request<Identity[]>('GET', '/identities'),
  getIdentity: (xid: string) => request<Identity>('GET', `/identities/${xid}`),
  deleteIdentity: (xid: string) => request<{ ok: boolean }>('DELETE', `/identities/${xid}`),

  addContact: (owner_xid: string, peer_xid: string, peer_name?: string) =>
    request<Contact>('POST', '/contacts', { owner_xid, peer_xid, peer_name }),
  listContacts: (owner_xid: string) =>
    request<Contact[]>('GET', `/contacts?owner_xid=${encodeURIComponent(owner_xid)}`),
  verifyContact: (contact_id: string) =>
    request<{ ok: boolean }>('POST', `/contacts/${contact_id}/verify`),

  createChat: (payload: CreateChatPayload) => request<Chat>('POST', '/chats', payload),
  listChats: (xid: string, include_vault = false) =>
    request<Chat[]>('GET', `/chats?xid=${encodeURIComponent(xid)}&include_vault=${include_vault}`),
  getChat: (chat_id: string) => request<Chat>('GET', `/chats/${chat_id}`),
  updateChat: (chat_id: string, update: UpdateChatPayload) =>
    request<Chat>('PATCH', `/chats/${chat_id}`, update),
  deleteChat: (chat_id: string) => request<{ ok: boolean }>('DELETE', `/chats/${chat_id}`),
  getFingerprint: (chat_id: string) =>
    request<{ chat_id: string; fingerprint: string; participants: string[] }>(
      'GET',
      `/chats/${chat_id}/fingerprint`,
    ),

  sendMessage: (payload: SendMessagePayload) => request<Message>('POST', '/messages', payload),
  listMessages: (chat_id: string, since?: string) =>
    request<Message[]>(
      'GET',
      `/messages?chat_id=${encodeURIComponent(chat_id)}${since ? `&since=${encodeURIComponent(since)}` : ''}`,
    ),
  markRead: (msg_id: string, xid: string) =>
    request<{ ok: boolean }>('POST', `/messages/${msg_id}/read?xid=${encodeURIComponent(xid)}`),
  destroyMessage: (msg_id: string) => request<{ ok: boolean }>('POST', `/messages/${msg_id}/destroy`),

  setTyping: (chat_id: string, xid: string, typing: boolean) =>
    request<{ ok: boolean }>('POST', '/typing', { chat_id, xid, typing }),
  getTyping: (chat_id: string, exclude_xid: string) =>
    request<{ chat_id: string; typing_xids: string[] }>(
      'GET',
      `/typing?chat_id=${encodeURIComponent(chat_id)}&exclude_xid=${encodeURIComponent(exclude_xid)}`,
    ),

  panic: (xid: string) => request<{ ok: boolean; wiped: boolean }>('POST', '/panic', { xid }),

  summarize: (messages: { sender: string; text: string }[]) =>
    request<{ summary: string }>('POST', '/ai/summarize', { messages }),
  smartReply: (messages: { sender: string; text: string }[]) =>
    request<{ suggestions: string[] }>('POST', '/ai/smart-reply', { messages }),
};
