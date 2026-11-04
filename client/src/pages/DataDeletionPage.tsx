import { useEffect } from "react";
import PolicyLayout, { PolicySection } from "@/components/PolicyLayout";

const COMPANY = "Hover Business Services LLP";
const PRODUCT = "HoverChat";
const EMAIL = "info@hovermedia.in";
const SUBJECT = "Data Deletion Request";

export const DataDeletionPage = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(SUBJECT)}`;

  return (
    <PolicyLayout title="User Data Deletion" lastUpdated="November 4, 2026">
      <PolicySection title="1. Overview">
        <p>
          {PRODUCT}, operated by {COMPANY}, lets you request deletion of the
          personal data we hold about you at any time. This page explains how to
          do it, what gets deleted, and what we may need to keep.
        </p>
      </PolicySection>

      <PolicySection title="2. How to Request Deletion">
        <ol className="list-decimal pl-6 space-y-2">
          <li>
            Send an email to <a href={mailto}>{EMAIL}</a> with the subject
            &quot;{SUBJECT}&quot;.
          </li>
          <li>
            Send it from the email address registered on your {PRODUCT} account
            so we can verify you. If you cannot, include your registered email,
            business name, and the WhatsApp number connected to your account.
          </li>
          <li>
            Tell us what you want deleted: your whole account, or specific data
            such as contacts or conversations.
          </li>
          <li>
            We will confirm by email once your identity is verified and after
            deletion is complete.
          </li>
        </ol>
        <p>
          We aim to complete verified requests within 30 days of receiving
          them.
        </p>
      </PolicySection>

      <PolicySection title="3. Self-Service Options">
        <p>
          Workspace admins can also remove data directly in the {PRODUCT} panel,
          for example by deleting contacts and conversations, or by deleting a
          connected WhatsApp channel from Settings. Deleting a channel stops{" "}
          {PRODUCT} from receiving and sending messages for that number.
        </p>
      </PolicySection>

      <PolicySection title="4. What We Delete">
        <ul className="list-disc pl-6 space-y-2">
          <li>Your account profile (name, email, phone number) and login data.</li>
          <li>
            Connected WhatsApp channel details and stored access tokens
            received from Meta.
          </li>
          <li>
            Contacts, groups, conversations, messages, media files, templates,
            campaigns, and automations stored in your workspace.
          </li>
          <li>
            Data we received through Facebook Login or Meta&apos;s Embedded
            Signup for your account.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="5. What We May Keep">
        <p>
          We may retain limited information where the law requires it or where
          it is needed to resolve disputes and prevent fraud, such as invoices,
          payment and tax records, and security logs. Deleted data may remain in
          encrypted backups for a short period until those backups are
          overwritten, and is not used in the meantime.
        </p>
      </PolicySection>

      <PolicySection title="6. If You Are a Contact of a Business">
        <p>
          If a business messaged you on WhatsApp using {PRODUCT} and you want
          your data removed, please ask that business first, since it controls
          your data. You can also email us at <a href={mailto}>{EMAIL}</a> with
          your phone number and the business name, and we will pass the
          request on or act on it where we are able to.
        </p>
      </PolicySection>

      <PolicySection title={`7. Removing ${PRODUCT} From Facebook / Meta`}>
        <p>
          If you connected {PRODUCT} using Facebook Login, you can also remove
          the app from your Facebook account:
        </p>
        <ol className="list-decimal pl-6 space-y-2">
          <li>
            Open Facebook and go to Settings &amp; privacy, then Settings.
          </li>
          <li>Go to Business Integrations (or Apps and Websites).</li>
          <li>
            Find {PRODUCT}, select it, and choose Remove. You can tick the
            option to delete data the app received from Facebook.
          </li>
        </ol>
        <p>
          After you remove the app, email us using the steps above so we can
          delete the data we hold in {PRODUCT}.
        </p>
      </PolicySection>

      <PolicySection title="8. Contact Us">
        <p>
          Questions about deletion or privacy? Email{" "}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. See also our{" "}
          <a href="/privacy-policy">Privacy Policy</a> and{" "}
          <a href="/terms">Terms of Service</a>.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
};
