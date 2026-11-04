import { useEffect } from "react";
import PolicyLayout, { PolicySection } from "@/components/PolicyLayout";

const COMPANY = "Hover Business Services LLP";
const PRODUCT = "HoverChat";
const EMAIL = "info@hovermedia.in";
const SITE = "https://hoverbusinessservices.com";
const APP_URL = "https://hoverchat.hovermessage.com";

export const TermsPage = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <PolicyLayout title="Terms of Service" lastUpdated="November 4, 2026">
      <PolicySection title="1. Acceptance of Terms">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of{" "}
          {PRODUCT} ({APP_URL}), a WhatsApp Business messaging platform
          operated by {COMPANY} (&quot;we&quot;, &quot;us&quot;,
          &quot;our&quot;). By creating an account or using the service you
          agree to these Terms and to our{" "}
          <a href="/privacy-policy">Privacy Policy</a>. If you use {PRODUCT}{" "}
          on behalf of a business, you confirm you have authority to bind that
          business.
        </p>
      </PolicySection>

      <PolicySection title="2. The Service">
        <p>
          {PRODUCT} lets businesses connect their WhatsApp Business Account
          through the WhatsApp Business Platform (Cloud API) to manage
          conversations in a shared inbox, send template and campaign
          messages, build automations and chatbots, manage contacts, and view
          analytics. Features may vary by plan and may change over time.
        </p>
        <p>
          {PRODUCT} is an independent product. It is not owned by, affiliated
          with, or endorsed by Meta Platforms, Inc. or WhatsApp.
        </p>
      </PolicySection>

      <PolicySection title="3. Eligibility and Accounts">
        <ul className="list-disc pl-6 space-y-2">
          <li>You must be at least 18 years old and able to form a contract.</li>
          <li>
            You must provide accurate registration information and keep it up
            to date.
          </li>
          <li>
            You are responsible for all activity under your account and for
            keeping your credentials confidential. Notify us immediately of any
            unauthorised use.
          </li>
          <li>
            Account owners are responsible for the actions of team members they
            invite.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="4. WhatsApp and Meta Compliance">
        <p>
          Your use of WhatsApp through {PRODUCT} is also subject to Meta&apos;s
          terms and policies, including the WhatsApp Business Terms of Service,
          WhatsApp Business Messaging Policy, and WhatsApp Commerce Policy, as
          updated by Meta from time to time. You agree to:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Obtain valid opt-in consent from recipients before messaging them,
            and honour opt-out requests promptly.
          </li>
          <li>
            Use message templates only for permitted purposes and in line with
            Meta&apos;s approval rules.
          </li>
          <li>
            Maintain a good quality rating and not send content Meta prohibits.
          </li>
        </ul>
        <p>
          Meta may restrict, limit, or suspend your WhatsApp number or account
          at its discretion. We are not responsible for such actions, for
          Meta&apos;s pricing changes, or for outages of the WhatsApp
          platform.
        </p>
      </PolicySection>

      <PolicySection title="5. Acceptable Use">
        <p>You agree not to use {PRODUCT} to:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Send spam, unsolicited bulk messages, or messages without consent.</li>
          <li>
            Send unlawful, fraudulent, harassing, hateful, sexually explicit,
            or deceptive content, or promote prohibited goods and services.
          </li>
          <li>Infringe intellectual property or privacy rights of others.</li>
          <li>
            Upload malware, or attempt to disrupt, probe, or gain unauthorised
            access to the service or its infrastructure.
          </li>
          <li>
            Resell or sublicense the service without our written permission,
            except under an approved reseller arrangement.
          </li>
          <li>Violate any applicable law or any Meta or WhatsApp policy.</li>
        </ul>
      </PolicySection>

      <PolicySection title="6. Your Content and Data">
        <p>
          You keep ownership of the content, contacts, and conversation data
          you submit (&quot;Customer Data&quot;). You grant us a limited
          licence to host, process, transmit, and display Customer Data only to
          provide and support the service.
        </p>
        <p>
          You are responsible for the legality of Customer Data and for having
          all rights and consents needed to upload contact details and message
          them. As between you and us, you are the controller of your
          contacts&apos; personal data and we act as your processor, as
          described in our <a href="/privacy-policy">Privacy Policy</a>.
        </p>
      </PolicySection>

      <PolicySection title="7. Plans, Fees, and Payments">
        <ul className="list-disc pl-6 space-y-2">
          <li>
            Paid features are charged according to the plan, wallet balance, or
            rates shown in the service at the time of purchase. Charges may
            include conversation or message fees set by Meta, where applicable.
          </li>
          <li>
            Fees are payable in advance, are non-transferable, and exclude
            applicable taxes unless stated otherwise.
          </li>
          <li>
            Payments are processed by third-party payment gateways. We do not
            store full card details.
          </li>
          <li>
            Subscriptions renew according to the selected billing period unless
            cancelled before renewal.
          </li>
          <li>
            Except where required by law or stated in writing, fees already
            paid are non-refundable.
          </li>
        </ul>
      </PolicySection>

      <PolicySection title="8. Third-Party Services">
        <p>
          The service integrates with third-party services such as Meta,
          payment gateways, and email or AI providers. Your use of those
          services is governed by their own terms. We are not responsible for
          third-party services or for their availability, accuracy, or
          policies.
        </p>
      </PolicySection>

      <PolicySection title="9. Intellectual Property">
        <p>
          {PRODUCT}, including its software, design, logos, and documentation,
          is owned by {COMPANY} and its licensors and is protected by
          intellectual property laws. Subject to these Terms, we grant you a
          limited, non-exclusive, non-transferable, revocable right to use the
          service for your internal business purposes.
        </p>
      </PolicySection>

      <PolicySection title="10. Availability and Changes">
        <p>
          We aim for reliable service but do not guarantee uninterrupted or
          error-free operation. We may modify, suspend, or discontinue features
          from time to time, with notice where reasonably possible.
        </p>
      </PolicySection>

      <PolicySection title="11. Suspension and Termination">
        <p>
          You may stop using {PRODUCT} and close your account at any time. We
          may suspend or terminate your access immediately if you breach these
          Terms, create risk or legal exposure for us or others, fail to pay
          fees, or if Meta restricts your WhatsApp account. On termination,
          your right to use the service ends. You can request deletion of your
          data as described on our <a href="/data-deletion">Data Deletion</a>{" "}
          page.
        </p>
      </PolicySection>

      <PolicySection title="12. Disclaimer of Warranties">
        <p>
          The service is provided &quot;as is&quot; and &quot;as
          available&quot; without warranties of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that messages will always be
          delivered, since delivery depends on Meta, carriers, and
          recipients&apos; devices.
        </p>
      </PolicySection>

      <PolicySection title="13. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, {COMPANY} will not be liable
          for any indirect, incidental, special, consequential, or punitive
          damages, or for loss of profits, revenue, data, or goodwill. Our
          total liability for any claim arising out of the service is limited
          to the fees you paid us in the three months before the event giving
          rise to the claim.
        </p>
      </PolicySection>

      <PolicySection title="14. Indemnification">
        <p>
          You agree to defend and indemnify {COMPANY}, its partners, and its
          personnel against claims, losses, and expenses (including reasonable
          legal fees) arising from your Customer Data, your messaging
          practices, your breach of these Terms, or your violation of any law
          or third-party rights.
        </p>
      </PolicySection>

      <PolicySection title="15. Governing Law">
        <p>
          These Terms are governed by the laws of India. Subject to applicable
          law, the courts of India have exclusive jurisdiction over any dispute
          arising from these Terms or the service.
        </p>
      </PolicySection>

      <PolicySection title="16. Changes to These Terms">
        <p>
          We may update these Terms from time to time. The last updated date is
          shown at the top of this page (November 4, 2026). Continued use of
          the service after changes take effect means you accept the updated
          Terms.
        </p>
      </PolicySection>

      <PolicySection title="17. Contact Us">
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