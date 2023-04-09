import axios from "axios";

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// a2 is claude
// beaver is Sage
// chinchilla is ChatGPT
// nutria is Dragonfly
const BotName: Record<string, string> = {
  claude: "a2",
  sage: "beaver",
  chatgpt: "chinchilla",
  dragonfly: "nutria",
};

function getBotName(bot: string) {
  return BotName[bot] || bot;
}

function getAuthorName(bot: string) {
  if (bot.startsWith("vn")) return "chinchilla";
  return getBotName(bot);
}

const BASE_URL = "https://www.quora.com/poe_api/gql_POST";
const HEADERS = {
  Host: "www.quora.com",
  Accept: "*/*",
  "apollographql-client-version": "1.1.6-65",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Poe 1.1.6 rv:65 env:prod (iPhone14,2; iOS 16.2; en_US)",
  "apollographql-client-name": "com.quora.app.Experts-apollo-ios",
  Connection: "keep-alive",
  "Content-Type": "application/json",
  "Quora-Formkey": process.env.FORMKEY,
  Cookie: process.env.COOKIE,
};
const RETRY_COUNT = 5;

export class Client {
  botName: string;
  authorName: string;
  chatId = "";

  constructor(bot: string) {
    this.botName = getBotName(bot);
    this.authorName = getAuthorName(bot);
  }

  private async makeGraphql(query: {
    operationName: string;
    query: string;
    variables: any;
  }) {
    const postData = JSON.stringify(query);

    const postConfig = {
      method: "post",
      url: BASE_URL,
      maxBodyLength: Infinity,
      headers: HEADERS,
      data: postData,
    };

    for (let i = 0; i < RETRY_COUNT; i++) {
      const resp = (await axios(postConfig)) as any;
      if (resp.data !== null) return resp.data;
    }
  }

  async getChatId() {
    const resp = await this.makeGraphql({
      operationName: "ChatViewQuery",
      query: `query ChatViewQuery($bot: String!) {
    chatOfBot(bot: $bot) {
      __typename
      ...ChatFragment
    }
  }
  fragment ChatFragment on Chat {
    __typename
    id
    chatId
    defaultBotNickname
    shouldShowDisclaimer
  }`,
      variables: {
        bot: this.botName,
      },
    });
    const chatId = resp.data.chatOfBot.chatId;
    this.chatId = chatId;
    return chatId;
  }

  async sendMessage(message: string) {
    return await this.makeGraphql({
      operationName: "AddHumanMessageMutation",
      query: `mutation AddHumanMessageMutation($chatId: BigInt!, $bot: String!, $query: String!, $source: MessageSource, $withChatBreak: Boolean! = false) {
    messageEdgeCreate(
      chatId: $chatId
      bot: $bot
      query: $query
      source: $source
      withChatBreak: $withChatBreak
    ) {
      __typename
      message {
        __typename
        node {
          __typename
          ...MessageFragment
          chat {
            __typename
            id
            shouldShowDisclaimer
          }
        }
      }
      messageLimit {
        __typename
        canSend
        numMessagesRemaining
        resetTime
        shouldShowRemainingMessageCount
        shouldShowReminder
        shouldShowSubscriptionRationale
        dailyLimit
        dailyBalance
        monthlyLimit
        monthlyBalance
      }
      chatBreak {
        __typename
        node {
          __typename
          ...MessageFragment
        }
      }
    }
  }
  fragment MessageFragment on Message {
    id
    __typename
    messageId
    text
    linkifiedText
    authorNickname
    state
    vote
    voteReason
    creationTime
    suggestedReplies
  }`,
      variables: {
        bot: this.botName,
        chatId: this.chatId,
        query: message,
        source: null,
        withChatBreak: true,
      },
    });
  }

  async getLastMessageRequest() {
    return await this.makeGraphql({
      operationName: "ChatPaginationQuery",
      query: `query ChatPaginationQuery($bot: String!, $before: String, $last: Int! = 10) {
    chatOfBot(bot: $bot) {
      id
      __typename
      messagesConnection(before: $before, last: $last) {
        __typename
        pageInfo {
          __typename
          hasPreviousPage
        }
        edges {
          __typename
          node {
            __typename
            ...MessageFragment
          }
        }
      }
    }
  }
  fragment MessageFragment on Message {
    id
    __typename
    messageId
    text
    linkifiedText
    authorNickname
    state
    vote
    voteReason
    creationTime
  }`,
      variables: {
        before: null,
        bot: this.botName,
        last: 1,
      },
    });
  }

  async clearContext(chatId: number) {
    await this.makeGraphql({
      operationName: "AddMessageBreakMutation",
      query: `mutation AddMessageBreakMutation($chatId: BigInt!) {
    messageBreakCreate(chatId: $chatId) {
      __typename
      message {
        __typename
        ...MessageFragment
      }
    }
  }
  fragment MessageFragment on Message {
    id
    __typename
    messageId
    text
    linkifiedText
    authorNickname
    state
    vote
    voteReason
    creationTime
    suggestedReplies
  }`,
      variables: {
        chatId: chatId,
      },
    });
  }

  async ask(message: string) {
    const chatId = await this.getChatId();
    await this.sendMessage(message);
    while (true) {
      await sleep(200);
      const resp = await this.getLastMessageRequest();
      try {
        const edges = resp.data.chatOfBot.messagesConnection.edges;
        const edge = edges[edges.length - 1];
        const node = edge.node;
        const { state, authorNickname } = node;
        if (state === "complete" && authorNickname === this.authorName) {
          return node.text;
        }
      } catch {}
    }
  }
}
