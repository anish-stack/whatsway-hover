import { useEffect } from "react";
import PolicyLayout, { PolicySection } from "@/components/PolicyLayout";

const COMPANY = "Hover Business Services LLP";
const PRODUCT = "HoverChat";
const EMAIL = "info@hovermedia.in";
const SITE = "https://hoverbusinessservices.com";
const APP_URL = "https://hoverchat.hovermessage.com";

export const PrivacyPage = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <PolicyLayout title="Privacy Policy" lastUpdated="November 4, 2026">
      <PolicySection title="1. Introduction">
        <p>
          {PRODUCT} ({APP_URL}) is a WhatsApp Business messaging platform
          operated by {COMPANY} (&quot;{PRODUCT}&quot;, &quot;we&quot;,
          &quot;us&quot;, &quot;our&quot;). This Privacy Policy explains what
          information we collect, how we use it, who we share it with, and the
          choices you have.
        </p>
        <p>
          By using {PRODUCT} you agree to this policy. If you do not agree,
          please do not use the service.
        </p>
      </PolicySection>

      <PolicySection title="2. Our Role">
        <p>
          For information about our own customers (the businesses that
          register on {PRODUCT}), we act as the data controller.
        </p>
        <p>
          For information about our customers&apos; contacts and
          conversations (for example, people who message a business on
          WhatsApp), the business using {PRODUCT} is the data controller and
          we act as a data processor, handling that data on the
          business&apos;s instructions. If you are a contact of a business and
          want to exercise your rights, please contact that business first.
          You may also write to us at {EMAIL}.
        </p>
      </PolicySection>

      <PolicySection title="3. Information We Collect">
        <p>
          <strong>Account information:</strong> name, email address, phone
          number, password (stored in hashed form), business name, and role
          within a workspace.
        </p>
        <p>
          <strong>WhatsApp Business information:</strong> when you connect a
          WhatsApp Business Account, we receive and store identifiers and
          credentials needed to operate it, such as the WhatsApp Business
          Account ID, Phone Number ID, display name, phone number, message
          templates, and access tokens issued by Meta.
        </p>
        <p>
          <strong>Conversation data:</strong> messages sent and received
          through your connected number, including text, media files, message
          status (sent, delivered, read, failed), timestamps, and the phone
          number and WhatsApp profile name of the sender or recipient.
        </p>
        <p>
          <strong>Contact data:</strong> contacts, groups, tags, and custom
          fields that you or your team add or import.
        </p>
        <p>
          <strong>Payment information:</strong> plan, wallet, and transaction
          records. Card and bank details are handled by our payment
          processors; we do not store full card numbers.
        </p>
        <p>
          <strong>Usage and technical data:</strong> IP address, browser and
          device type, pages visited, activity logs, and error logs.
        </p>
        <p>
          <strong>Cookies:</strong> we use cookies for sign-in sessions,
          security (CSRF protection), and preferences. See our{" "}
          <a href="/cookie-policy">Cookie Policy</a>.
        </p>
      </PolicySection>

      <PolicySection title="4. How We Use Information">
        <ul className="list-disc pl-6 space-y-2">
          <li>To provide, operate, and maintain the {PRODUCT} service.</li>
          <li>
            To send and receive WhatsApp messages on your behalf through the
            WhatsApp Business Platform (Cloud API).
          </li>
          <li>
            To show conversations in your shared inbox, run campaigns,
            automations, chatbots, and reports that you configure.
          </li>
          <li>To manage accounts, plans, billing, and support requests.</li>
          <li>
            To secure the service, prevent abuse and fraud, and comply with
            legal obligations and Meta platform policies.
          </li>
          <li>
            To send service notices such as verification emails, security
            alerts, and important product updates.
          </li>
        </ul>
        <p>We do not sell personal information.</p>
      </PolicySection>

      <PolicySection title="5. Meta and WhatsApp">
        <p>
          {PRODUCT} uses the WhatsApp Business Platform provided by Meta
          Platforms, Inc. and its affiliates. When you connect a number
          (including through Meta&apos;s Embedded Signup or Facebook Login for
          Business), Meta shares with us the business and account information
          needed to operate your WhatsApp channel, and Meta sends us webhook
          events for incoming messages and message status.
        </p>
        <p>
          We use data received from Meta only to provide the {PRODUCT} service
          to you. We do not use it for advertising and we do not sell it. Meta
          processes WhatsApp data under its own terms and privacy policy.{" "}
          {PRODUCT} is an independent service and is not owned by or endorsed
          by Meta or WhatsApp.
        </p>
      </PolicySection>

      <PolicySection title="6. Who We Share Information With">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Meta / WhatsApp</strong> to deliver messages and manage
            your WhatsApp Business Account.
          </li>
          <li>
            <strong>Payment processors</strong> (such as Razorpay, Stripe,
            PayPal, Paystack, or Mercado Pago, depending on the gateway
            enabled) to process payments.
          </li>
          <li>
            <strong>Infrastructure and service providers</strong> such as
            hosting, storage, email delivery, and network security providers,
            who process data only on our instructions.
          </li>
          <li>
            <strong>AI providers</strong>, only if you enable AI assistant or
            chatbot features, in which case the relevant message content is
            sent to the provider you configure.
          </li>
          <li>
            <strong>Authorities</strong> when required by law, or to protect
            our rights, users, or the public.
          </li>
          <li>
            <strong>Business transferees</strong> in the event of a merger,
            acquisition, or sale of assets, subject to this policy.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="7. Data Retention">
        <p>
          We keep account and conversation data for as long as your account is
          active. When you close your account or request deletion, we delete or
          anonymise your data as described on our{" "}
          <a href="/data-deletion">Data Deletion</a> page, except where we must
          keep certain records (for example billing and tax records) to meet
          legal obligations or resolve disputes.
        </p>
      </PolicySection>

      <PolicySection title="8. Security">
        <p>
          We use measures such as encrypted connections (HTTPS), hashed
          passwords, role-based access control, webhook signature
          verification, and access logging. No system is completely secure, so
          we cannot guarantee absolute security. Please keep your credentials
          confidential and tell us promptly if you suspect unauthorised access.
        </p>
      </PolicySection>

      <PolicySection title="9. International Transfers">
        <p>
          Your information may be processed in countries other than your own,
          including where our service providers and Meta operate. Where
          required, we use appropriate safeguards for such transfers.
        </p>
      </PolicySection>

      <PolicySection title="10. Your Rights">
        <p>
          Depending on where you live, you may have the right to access,
          correct, export, or delete your personal information, to object to or
          restrict certain processing, and to withdraw consent. To exercise
          these rights, email {EMAIL}. To request deletion, follow the steps on
          our <a href="/data-deletion">Data Deletion</a> page. We may need to
          verify your identity before acting on a request.
        </p>
      </PolicySection>

      <PolicySection title="11. Messaging Consent">
        <p>
          Businesses using {PRODUCT} are responsible for obtaining valid
          opt-in consent from their contacts before sending WhatsApp messages,
          and for honouring opt-out requests, as required by WhatsApp&apos;s
          policies and applicable law.
        </p>
      </PolicySection>

      <PolicySection title="12. Children">
        <p>
          {PRODUCT} is intended for businesses and is not directed to anyone
          under 18. We do not knowingly collect personal information from
          children. If you believe a child has provided us information, contact
          us and we will delete it.
        </p>
      </PolicySection>

      <PolicySection title="13. Changes to This Policy">
        <p>
          We may update this policy from time to time. The &quot;last
          updated&quot; date is shown at the top of this page (November 4,
          2026). Material changes will be notified through the service or by
          email.
        </p>
      </PolicySection>

      <PolicySection title="14. Contact Us">
        <p>
          {COMPANY}
          <br />
          Email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          <br />
          Website: <a href={SITE}>{SITE}</a>
        </p>
      </PolicySection>
    </PolicyLayout>
  );
};