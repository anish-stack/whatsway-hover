/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import { useEffect } from "react";
import { useLocation } from "wouter";

export function useGlobalNotifications(
  socket: any,
  unreadCount: number
) {
  const [location] = useLocation();

  // 🔔 Browser title update (ALWAYS works)
  useEffect(() => {
    document.title =
      unreadCount > 0 ? `(${unreadCount}) Team Inbox` : "Team Inbox";
  }, [unreadCount]);

  // 🔔 Browser notification (ALWAYS works)
  useEffect(() => {
    if (!socket) return;

    const handler = (data: any) => {
      const message =
        typeof data?.content === "string"
          ? data.content
          : "New message";

      const isInbox = location.startsWith("/inbox");
      const shouldNotify =
        Notification.permission === "granted" &&
        !document.hasFocus();

      if (shouldNotify) {
        new Notification("New WhatsApp Message", {
          body: message,
          icon: "/whatsapp-icon.png",
        });
      }
    };

    socket.on("new-message", handler);
    return () => socket.off("new-message", handler);
  }, [socket, location]);
}
