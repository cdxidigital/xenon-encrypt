const API = process.env.EXPO_PUBLIC_BACKEND_URL;

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  // Identities
  createIdentity: (name: string, disposable = false) =>
    request<any>('POST', '/identities', { name, disposable }),
  listIdentities: () => request<any[]>('GET', '/identities'),
  getIdentity: (xid: string) => request<any>('GET', `/identities/${xid}`),
  deleteIdentity: (xid: string) => request<any>('DELETE', `/identities/${xid}`),

  // Contacts
  addContact: (owner_xid: string, peer_xid: string, peer_name?: string) =>
    request<any>('POST', '/contacts', { owner_xid, peer_xid, peer_name }),
  listContacts: (owner_xid: string) =>
    request<any[]>('GET', `/contacts?owner_xid=${encodeURIComponent(owner_xid)}`),
  verifyContact: (contact_id: string) =>
    request<any>('POST', `/contacts/${contact_id}/verify`),

  // Chats
  createChat: (payload: any) => request<any>('POST', '/chats', payload),
  listChats: (xid: string, include_vault = false) =>
    request<any[]>('GET', `/chats?xid=${encodeURIComponent(xid)}&include_vault=${include_vault}`),
  getChat: (chat_id: string) => request<any>('GET', `/chats/${chat_id}`),
  updateChat: (chat_id: string, update: any) =>
    request<any>('PATCH', `/chats/${chat_id}`, update),
  deleteChat: (chat_id: string) => request<any>('DELETE', `/chats/${chat_id}`),
  getFingerprint: (chat_id: string) =>
    request<{ chat_id: string; fingerprint: string; participants: string[] }>(
      'GET',
      `/chats/${chat_id}/fingerprint`,
    ),

  // Messages
  sendMessage: (payload: any) => request<any>('POST', '/messages', payload),
  listMessages: (chat_id: string, since?: string) =>
    request<any[]>(
      'GET',
      `/messages?chat_id=${encodeURIComponent(chat_id)}${since ? `&since=${encodeURIComponent(since)}` : ''}`,
    ),
  markRead: (msg_id: string, xid: string) =>
    request<any>('POST', `/messages/${msg_id}/read?xid=${encodeURIComponent(xid)}`),
  destroyMessage: (msg_id: string) => request<any>('POST', `/messages/${msg_id}/destroy`),

  // Typing
  setTyping: (chat_id: string, xid: string, typing: boolean) =>
    request<any>('POST', '/typing', { chat_id, xid, typing }),
  getTyping: (chat_id: string, exclude_xid: string) =>
    request<any>(
      'GET',
      `/typing?chat_id=${encodeURIComponent(chat_id)}&exclude_xid=${encodeURIComponent(exclude_xid)}`,
    ),

  // Panic
  panic: (xid: string) => request<any>('POST', '/panic', { xid }),

  // AI
  summarize: (messages: { sender: string; text: string }[]) =>
    request<{ summary: string }>('POST', '/ai/summarize', { messages }),
  smartReply: (messages: { sender: string; text: string }[]) =>
    request<{ suggestions: string[] }>('POST', '/ai/smart-reply', { messages }),
};
