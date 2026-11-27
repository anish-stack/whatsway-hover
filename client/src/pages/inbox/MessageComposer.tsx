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

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Send,
  Paperclip,
  AlertCircle,
} from "lucide-react";
import { TemplatePickerDialog } from "@/components/shared/TemplatePickerDialog";
import type { Conversation } from "@shared/schema";
import { useRef, useState } from "react";
import { CannedPickerButton, SlashSuggestions, markCannedUsed, rankCanned, useCanned } from "@/components/canned/CannedPicker";
import { fillCanned, type CannedMessage } from "@/components/canned/canned";
import { useAuth } from "@/contexts/auth-context";
import { useChannelContext } from "@/contexts/channel-context";


interface MessageComposerProps {
  selectedConversation: Conversation;
  messageText: string;
  onTyping: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSendMessage: () => void;
  onFileAttachment: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectTemplate: (template: any, variables: { type?: string; value?: string }[], mediaId?: string, headerType?: string | null, buttonParameters?: string[], expirationTimeMs?: number, carouselCardMediaIds?: Record<number, string>) => void;
  is24HourWindowExpired: boolean;
  activeChannelId?: string;
  sendMessagePending: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

const MessageComposer = ({
  selectedConversation,
  messageText,
  onTyping,
  onSendMessage,
  onFileAttachment,
  onFileChange,
  onSelectTemplate,
  is24HourWindowExpired,
  activeChannelId,
  sendMessagePending,
  fileInputRef,
}: MessageComposerProps) => {
  const { user } = useAuth() as any;
  const { selectedChannel } = useChannelContext() as any;
  const canned = useCanned();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashClosed, setSlashClosed] = useState(false);
  const slash = /^\/([\w-]*)$/.exec(messageText || "");
  const slashRows = slash && !slashClosed ? rankCanned(canned.data?.data || [], slash[1]).slice(0, 8) : [];
  const showSlash = !!slash && !slashClosed;

  const setText = (value: string) => onTyping({ target: { value } } as React.ChangeEvent<HTMLTextAreaElement>);
  const insertCanned = (m: CannedMessage) => {
    const contact = String(selectedConversation.contactName || "").trim();
    const text = fillCanned(m.content, {
      customer_name: contact && contact !== selectedConversation.contactPhone ? contact : "",
      customer_first_name: contact && contact !== selectedConversation.contactPhone ? contact.split(/\s+/)[0] : "",
      customer_phone: selectedConversation.contactPhone || "",
      agent_name: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || "",
      business_name: selectedChannel?.name || "",
      today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
    });
    const base = slash ? "" : messageText;
    setText(base ? `${base}${/\s$/.test(base) ? "" : " "}${text}` : text);
    setSlashIndex(0);
    markCannedUsed(m.id);
    setTimeout(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
      // jump to the first unfilled {{variable}} so the agent can type it
      const at = el.value.indexOf("{{");
      if (at >= 0) el.setSelectionRange(at, el.value.indexOf("}}", at) + 2);
    }, 0);
  };

  return (
    <div className="bg-background border-t border-border p-3 md:p-4">
      {is24HourWindowExpired &&
        selectedConversation.type === "whatsapp" && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-800">
                  24-hour window expired
                </p>
                <p className="text-yellow-700">
                  You can only send template messages now
                </p>
              </div>
            </div>
          </div>
        )}

      <div className="flex items-end gap-1 md:gap-2">
        <div className="flex gap-1">
          {selectedConversation.type === "whatsapp" && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 md:h-9 md:w-9"
                      onClick={onFileAttachment}
                      disabled={false}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Attach File</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={onFileChange}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
              />

                <TemplatePickerDialog
                  channelId={activeChannelId}
                  onSelectTemplate={onSelectTemplate}
                />
            </>
          )}
          <CannedPickerButton
            onPick={insertCanned}
            disabled={is24HourWindowExpired && selectedConversation.type === "whatsapp"}
          />


          
        </div>

        

        <div className="relative flex-1">
        {showSlash && <SlashSuggestions rows={slashRows} query={slash![1]} activeIndex={Math.min(slashIndex, Math.max(slashRows.length - 1, 0))} onPick={insertCanned} />}
        <textarea
          ref={textRef}
          placeholder={
            is24HourWindowExpired &&
            selectedConversation.type === "whatsapp"
              ? "Templates only"
              : "Type a message, or / for saved replies"
          }
          value={messageText}
          onChange={(e) => { setSlashClosed(false); setSlashIndex(0); onTyping(e); }}
          aria-autocomplete="list"
          onKeyDown={(e) => {
            if (showSlash && slashRows.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex((i) => (i + 1) % slashRows.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex((i) => (i - 1 + slashRows.length) % slashRows.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertCanned(slashRows[Math.min(slashIndex, slashRows.length - 1)]); return; }
            }
            if (showSlash && e.key === "Escape") { e.preventDefault(); setSlashClosed(true); return; }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSendMessage();
            }
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 120) + "px";
          }}
          disabled={
            is24HourWindowExpired &&
            selectedConversation.type === "whatsapp"
          }
          rows={1}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: "36px", maxHeight: "120px" }}
        />
        </div>

        <Button
          onClick={onSendMessage}
          disabled={
            !messageText.trim() ||
                (is24HourWindowExpired &&
                  selectedConversation.type === "whatsapp") ||
                sendMessagePending
          }
          size="icon"
          className="h-8 w-8 md:h-9 md:w-9 bg-emerald-500 hover:bg-emerald-600"
          data-testid="button-send-message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default MessageComposer;
