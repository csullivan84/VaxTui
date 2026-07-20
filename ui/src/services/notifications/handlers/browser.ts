import type { NotificationEvent } from "../../../types";

function notifTitle(hostname: string, slug: string): string {
  if (hostname && slug) return `${hostname}: ${slug}`;
  return hostname || slug || "Shelley";
}

function focusConversation(notification: Notification, conversationURL?: string): void {
  notification.onclick = () => {
    const target = conversationURL || window.location.href;
    window.location.assign(`${target.split("#")[0]}#turn-completion-summary`);
    window.focus();
    notification.close();
  };
}

export function browserNotificationHandler(event: NotificationEvent): void {
  if (!document.hidden) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const hostname = event.payload?.hostname || window.__SHELLEY_INIT__?.hostname || "localhost";
  const slug = event.payload?.conversation_title || "";

  switch (event.type) {
    case "agent_done": {
      const body = event.payload?.final_response || "Agent finished";
      const notification = new Notification(notifTitle(hostname, slug), {
        body,
        tag: `shelley-done-${event.conversation_id}`,
      });
      focusConversation(notification, event.payload?.conversation_url);
      break;
    }
    case "agent_error": {
      const body = event.payload?.error_message || "Agent error";
      const notification = new Notification(notifTitle(hostname, "error"), {
        body,
        tag: `shelley-error-${event.conversation_id}`,
      });
      focusConversation(notification, event.payload?.conversation_url);
      break;
    }
  }
}
