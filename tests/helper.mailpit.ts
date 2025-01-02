import { test, expect, APIRequestContext } from '@playwright/test';

let apiContext: APIRequestContext;

interface MessageList {
  messages: Message[];
}

interface Message {
  Subject: string;
  From: {
    Address: string;
  };
  To: [
    {
      Address: string;
    }
  ];
}

test.beforeEach(async ({ playwright }) => {
  if (!apiContext) {
    apiContext = await playwright.request.newContext({
      baseURL: 'http://localhost:4202',
    });
  }
});

export async function deleteAllMails(): Promise<void> {
  await apiContext.delete(`/api/v1/messages`);
}

export async function expectMail(from: string, to: string, subject: string): Promise<void> {
  const response = await apiContext.get(`/api/v1/messages`);
  const responseJson = (await response.json()) as MessageList;

  const message = responseJson.messages.find((message) => {
    return message.From.Address === from && message.To[0].Address === to && message.Subject === subject;
  });

  expect(message).toBeDefined();
}

export async function sendFakeMail(from: string, to: string, subject: string, body: string): Promise<void> {
  await apiContext.post(`/api/v1/send`, {
    data: {
      From: { Email: from },
      To: [{ Email: to }],
      Subject: subject,
      Text: body,
    },
  });
}
