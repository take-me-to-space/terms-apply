import { Link } from 'react-router-dom';
import { supportEmail } from '../lib/support';
import { PageIntro } from '../components/ui';
export function Privacy() {
  const contact = supportEmail;
  return (
    <article className="wrap legal-page">
      <PageIntro title="Privacy & terms">
        <p>A plain-language explanation of how Terms Apply works.</p>
      </PageIntro>
      <h2>What the app does</h2>
      <p>
        Terms Apply records what you tell it. It does not verify your actions,
        enforce pledges, transfer money as a pledge, or charge you for missing a
        goal. A confirmed agreement is a personal commitment, not a contract for
        enforced consequences. Choose safe, manageable pledges; essentials and
        risky behaviour have no place in one.
      </p>
      <h2>What we keep</h2>
      <p>
        Your account email, authentication records, reminder preference,
        original agreements, deadlines, timezone, self-reported outcomes,
        timestamps, notes, and withdrawal reasons. Unsigned drafts are kept in
        session storage in the current browser tab until confirmed, cleared, or
        the tab is closed. The app uses browser storage to keep you signed in.
      </p>
      <h2>Who can access your records</h2>
      <p>
        Other users cannot access your records. Authorised operators and the
        infrastructure providers can access data as needed to run, secure, and
        support the service. “Private” does not mean encrypted from the
        operator. Avoid including passwords, financial details, medical records,
        or other sensitive information in goals and notes.
      </p>
      <h2>Service providers</h2>
      <p>
        Netlify hosts the app and scheduled functions. Supabase handles accounts
        and database storage. If you enable reminders, Resend receives your
        email address, the type and time of a reminder, and a link containing
        the agreement ID. Goal text, pledge text, and notes are not included in
        reminder emails. Account confirmation and password recovery emails are
        delivered by the authentication email service configured by the
        operator.
      </p>
      <p>
        Providers may retain security, delivery, and infrastructure logs
        according to their policies. The app does not install advertising
        trackers or share your records with other users.
      </p>
      <h2>Optional reminders</h2>
      <p>
        Turn them on or off in <Link to="/settings">Account</Link>. Turning them
        off stops future delivery attempts; a message already being delivered
        may still arrive. Availability is shown in the app. No email service can
        promise exact delivery. Without a report in the app, the outcome stays
        unreported. Silence is never recorded as a missed goal or an unhonoured
        pledge.
      </p>
      <h2>Exporting and deleting your data</h2>
      <p>
        You can export your data and permanently delete your account in Account.
        Deletion removes live app records and pending jobs. Already-sent
        messages and provider logs cannot be recalled; backup copies expire
        under the operator’s configured backup retention. Previously recorded
        answers cannot currently be edited in the app. Withdrawal preserves the
        original agreement.
      </p>
      <h2 id="billing">Plans, billing & cancellation</h2>
      <p>
        Where billing is enabled, the free plan includes three new confirmed
        commitments per calendar month, resetting at 00:00 UTC on the first.
        Drafts do not count. Withdrawal does not restore the allowance.
        Commitments made before the billing rollout do not count. Plus includes
        unlimited new commitments for ₹199 per month, including taxes. Checkout
        is optional; the free plan does not require a card. Existing records,
        reports, exports, and reminders remain accessible on either plan.
      </p>
      <p>
        Plus renews monthly until cancelled. Cancel renewal in Account or
        through Dodo’s billing portal; paid access lasts through the period
        already paid for. Cancellation does not automatically refund earlier
        payments. A failed renewal does not extend paid access. When paid access
        ends, the free monthly allowance applies, counting new commitments
        already made that month. Missing a goal never creates a charge.
      </p>
      <p>
        Dodo Payments handles checkout, payments, invoices, and subscription
        billing as merchant of record. It receives your account email and
        information you enter at checkout, including payment and billing
        details. Terms Apply stores provider identifiers, payment-period dates,
        and subscription status; it does not store card details or send your
        goals, pledges, or notes to Dodo. Dodo may retain financial and tax
        records after app-account deletion under its legal retention
        obligations.
      </p>
      <p>
        To request a refund, report an incorrect charge, or request account
        deletion where an unfinished checkout prevents self-service deletion,
        contact <a href={`mailto:${contact}`}>{contact}</a> with your account
        email and payment reference. Do not send card details or passwords.
        Refund requests are reviewed individually; your statutory consumer
        rights are unaffected. Deleting an account cancels its subscription
        immediately and ends remaining paid access; it does not itself issue a
        refund.
      </p>
      <h2>The separate waitlist</h2>
      <p>
        The earlier waitlist is a separate system. Joining it does not create an
        app account, and deleting an app account does not delete a waitlist
        submission.
      </p>
      {contact && (
        <>
          <h2>Questions or data requests</h2>
          <p>
            Contact <a href={`mailto:${contact}`}>{contact}</a>. Please do not
            send passwords.
          </p>
        </>
      )}
      <p className="fine-print">
        Use is intended for adults. This is a follow-through tool, not medical,
        legal, or financial advice. Updated 22 October 2026.
      </p>
    </article>
  );
}
