import { expect, request, type APIRequestContext } from '@playwright/test';

interface Message {
  Subject: string;
  From: { Address: string };
  To: { Address: string }[];
}

async function withMailpit(action: (context: APIRequestContext) => Promise<void>): Promise<void> {
  const context = await request.newContext({ baseURL: 'http://localhost:4203' });
  try { await action(context); }
  finally { await context.dispose(); }
}

export async function deleteAllMails(): Promise<void> {
  await withMailpit(async (context) => {
    expect((await context.delete('/api/v1/messages')).ok()).toBe(true);
  });
}

export async function expectMail(from: string, to: string, subject: string | RegExp): Promise<void> {
  await withMailpit(async (context) => {
    let envelopes: Message[] = [];
    try {
      await expect.poll(async () => {
        const response = await context.get('/api/v1/messages');
        expect(response.ok()).toBe(true);
        const { messages } = await response.json() as { messages: Message[] };
        envelopes = messages;
        return messages.some((message) =>
          message.From.Address === from && message.To.some((recipient) => recipient.Address === to) &&
          (typeof subject === 'string' ? message.Subject === subject : subject.test(message.Subject)));
      }, { timeout: 15_000 }).toBe(true);
    } catch {
      throw new Error(`Expected mail from ${from} to ${to}; received envelopes: ${JSON.stringify(envelopes.map(({ From, To, Subject }) => ({ From, To, Subject })))}`);
    }
  });
}

export async function sendFakeMail(from: string, to: string, subject: string, body: string): Promise<void> {
  await withMailpit(async (context) => {
    const response = await context.post('/api/v1/send', {
      data: { From: { Email: from }, To: [{ Email: to }], Subject: subject, Text: body },
    });
    expect(response.ok()).toBe(true);
  });
}
