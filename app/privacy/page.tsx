import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, LegalPage, type LegalSection } from '@/components/legal/legal-page';
import { OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Lotline stores, where, for how long, and how to delete your account.',
  alternates: { canonical: '/privacy' },
};

const sections: LegalSection[] = [
  { id: 'without-an-account', title: 'Planning without an account', body: <>
    <p>You can plan, get estimates and export a plan without an account. Your draft (budget, assets and percentages) is saved in this browser. Lotline receives it only when you ask for live data or choose to save it to an account.</p>
  </> },
  { id: 'accounts', title: 'Accounts and sign-in', body: <>
    <p>Accounts are optional. Supabase runs sign-in for Lotline. There are two ways in:</p>
    <ul>
      <li><strong>Email and password.</strong> Supabase Auth stores your email address and a hashed password, never the password itself.</li>
      <li><strong>Sign in with Solana.</strong> Your wallet signs one message that names this site, the time and the words “Sign in to Lotline. This proves you hold this wallet; it sends no transaction and moves no funds.” Supabase Auth checks the signature and records your wallet’s public address as the account’s identity (a <code>web3:solana</code> identity). No email is needed. The signature cannot move funds.</li>
    </ul>
    <p>Signed in, cookies on this site keep your session. Supabase Auth may log sign-in events, including your IP address, for security under its own policy. Signing out ends the session on this browser. It does not delete anything.</p>
  </> },
  { id: 'account-data', title: 'What an account stores', body: <>
    <p>Nothing from your draft is uploaded when you sign in. These records exist only after you choose the action that creates them:</p>
    <ul>
      <li><strong>Saved plans</strong> (Save this plan): a name, a USDC budget, the assets and their percentages, and when you saved it. Up to 20. No wallet address, balance or quote.</li>
      <li><strong>Synced reminders</strong> (sync on a reminder): its budget, split, weekly or monthly cadence, time zone, next date and whether it is paused. Reminders stay on your device unless you sync them.</li>
      <li><strong>Shared community plans</strong> (Share to community): the saved plan’s name and split, an optional display name, a copy count and dates. Anyone can see these on Community. Your budget, email and wallet are never shown. Each shared plan also carries an author key, the same for all your shared plans, so a reader can hide your plans on their own device. It is a salted hash and does not reveal your account.</li>
      <li><strong>Copies.</strong> When a signed-in member copies a shared plan, we record that their account copied it, once, to count copies. Authors see only the total.</li>
      <li><strong>Reports.</strong> When you report a shared plan, we store the plan, your reason and the time. A signed-in report is linked to your account. A guest report is linked to a salted hash of your IP address instead of the address itself. Reports are never shown to the author or to other members. A plan reported by three different people is hidden until it is reviewed.</li>
    </ul>
    <p>Follows of community plans and authors you hide stay on your device only. They are never sent to Lotline.</p>
  </> },
  { id: 'purchases', title: 'Purchases and the purchase journal', body: <>
    <p>In-app purchases are a restricted launch for reviewed wallets. Everywhere else they are off, and you can take your plan to Jupiter yourself.</p>
    <p>When a purchase is reviewed, Lotline records it in a purchase journal: your wallet’s public address, the budget, the assets and amounts, the quote, fee and route details, the transaction Jupiter prepared for your review, a hash of each transaction, each transaction’s signature once your wallet signs it, and the status and receipt of every step. Your signed transaction passes through our server to Jupiter, which sends it to Solana. The journal is linked to your account when you are signed in. Otherwise it is linked to a random key in a cookie that lasts one day.</p>
    <p>Your wallet asks you to approve every transaction. Lotline never sees or stores your private key or recovery phrase and never asks for them.</p>
  </> },
  { id: 'services', title: 'Live data and the services we use', body: <>
    <p>Your browser talks only to lotline.dev, to Supabase for accounts and, on Android, to your wallet app on the same device. Our server makes every other request, so those services see our server, not your device. Each one receives only what the request needs:</p>
    <ul>
      <li><strong>Vercel</strong> hosts lotline.dev and runs our server. It may keep request logs, including IP addresses, under its own policy.</li>
      <li><strong>Supabase</strong> stores accounts, the records above and our rate-limit counts.</li>
      <li><strong>Our Solana RPC provider</strong> receives a public wallet address when you load balances, and transaction signatures when a purchase receipt is checked. It also serves public token and price accounts. The address you paste to load balances is held in our server’s memory for at most 15 seconds, to avoid repeat requests, and is never saved.</li>
      <li><strong>Jupiter</strong> receives token addresses and USDC amounts for estimates, with no wallet, and token searches for Markets. For a restricted-launch purchase it receives your wallet’s public address and your signed transaction.</li>
      <li><strong>GeckoTerminal</strong> receives a token’s public address to return its price history for charts.</li>
      <li><strong>Pyth</strong> receives public price-feed IDs for reference prices.</li>
      <li><strong>xStocks</strong> (Backed) and <strong>PreStocks</strong> provide their public catalogs and token details. <strong>Backpack</strong> provides public market prices for some assets. When switched on, <strong>tokens.xyz</strong> provides extra public asset details. None of them receives anything about you.</li>
    </ul>
    <p>Opening Jupiter from your plan takes you to its own website, with its own terms and privacy practices. Lotline cannot see what you do there.</p>
  </> },
  { id: 'rate-limits', title: 'Rate limits and your IP address', body: <>
    <p>To keep live data and accounts available, our server counts requests from each connection. It reads your IP address from our host’s network header. Two counts are kept:</p>
    <ul>
      <li>A short count over a one to ten minute window, keyed by the IP address. It stays in our server’s memory, is never written to disk, and is dropped when the server needs the room or restarts.</li>
      <li>A shared count in Supabase, keyed by a salted hash of the IP address (HMAC-SHA-256 with a server secret), never the address itself. Counts older than a day are removed during routine cleanup.</li>
    </ul>
  </> },
  { id: 'device', title: 'On your device', body: <>
    <p>Lotline keeps these in this browser’s storage:</p>
    <ul>
      <li>Your plan drafts for xStocks and PreStocks, a target split, and reminders.</li>
      <li>Community plans you follow and authors you hide.</li>
      <li>While a purchase is in progress, a short record of the transactions this browser sent, so it never sends one twice. For the open tab only, the purchase or followed plan you are reviewing.</li>
      <li>Account session cookies and, for a guest purchase, the one-day journal key.</li>
      <li>The installed app’s offline copy of the synthetic Example. Live data, account pages and saved plans are never cached for offline use.</li>
      <li>On Android, Mobile Wallet Adapter can remember your wallet app’s approval, including its public address, so it does not ask on every visit.</li>
    </ul>
    <p>Clearing this site’s data in your browser removes all of it.</p>
  </> },
  { id: 'links', title: 'Plan links and exports', body: <>
    <p>A plan link holds its mode, budget, assets and percentages after the <code>#</code> in the address. Browsers do not send that part to servers. Anyone you give the link to can read the split. Copied plans, CSV files and calendar files stay with you.</p>
  </> },
  { id: 'never', title: 'What we never do', body: <>
    <ul>
      <li>No advertising, analytics or tracking scripts.</li>
      <li>We do not sell or rent your data.</li>
      <li>We never ask for your private key or recovery phrase, and nothing in Lotline can move your funds without your wallet’s approval.</li>
    </ul>
  </> },
  { id: 'retention', title: 'How long we keep data', body: <>
    <ul>
      <li>Accounts, saved plans, synced reminders and shared plans: until you delete them or delete your account.</li>
      <li>Copy records: until the shared plan or the copying account is deleted.</li>
      <li>Reports: until the shared plan or the reporting account is deleted.</li>
      <li>Purchase journal for an account: until you delete your account.</li>
      <li>Purchase journal for a guest: removed 30 days after a purchase finishes, or two days after a review that was never signed, when cleanup next runs.</li>
      <li>Rate-limit counts: about a day, as above.</li>
    </ul>
  </> },
  { id: 'delete', title: 'Deleting your account', body: <>
    <p>Signed in, open <Link href="/sign-in">Account</Link> (or the account panel in your planner) and choose <strong>Delete account</strong>. After you confirm, Lotline deletes your account and removes:</p>
    <ul>
      <li>your email or wallet sign-in identity and your sessions;</li>
      <li>your saved plans and synced reminders;</li>
      <li>your shared community plans, with their copy records;</li>
      <li>the copies you counted and the reports you sent;</li>
      <li>your purchase journal.</li>
    </ul>
    <p>Some things cannot be removed:</p>
    <ul>
      <li><strong>Transactions on Solana are public and permanent.</strong> Deleting your account does not remove them, or anything else on-chain.</li>
      <li>A copy you counted stays in that plan’s total, which names no one.</li>
      <li>Records made while you were signed out are not linked to your account. A guest purchase journal expires on the schedule above. A guest report stays until its plan is deleted.</li>
      <li>Rate-limit counts expire on their own, and our providers’ logs and backups follow their own retention.</li>
      <li>Data in this browser stays until you clear this site’s data.</li>
    </ul>
  </> },
  { id: 'security', title: 'Security', body: <>
    <p>Lotline is served only over HTTPS with a strict content security policy. Account records are protected by row-level security, so each account reaches only its own data, and shared records are reachable only through checked database functions. Changes must come from this site. Server keys never reach the browser. No system is perfectly secure, so keep your wallet and email account protected too.</p>
  </> },
  { id: 'age', title: 'Adults only', body: <>
    <p>Lotline is for adults aged 18 or over. It is not directed at children, and we do not knowingly collect data from anyone under 18. If you think a child has made an account, contact us and we will delete it.</p>
  </> },
  { id: 'international', title: 'International use', body: <>
    <p>Our providers run servers in more than one country, so your data may be processed outside the country where you live. Depending on where you live, you may have rights to access, correct, export or delete your data. Your account’s saved plans are visible to you in the planner, you can export any plan, and you can delete your account at any time. For anything else, contact us.</p>
  </> },
  { id: 'changes', title: 'Changes to this policy', body: <>
    <p>When what Lotline collects changes, we update this page and its date. We describe significant changes here before they apply.</p>
  </> },
  { id: 'contact', title: 'Contact', body: <>
    <p>{OPERATOR} runs Lotline.</p>
    <ContactLine />
  </> },
];

export default function PrivacyPage() {
  return <LegalPage eyebrow="PRIVACY POLICY" title="What Lotline stores, and why." sections={sections}
    intro={<p>This policy covers lotline.dev and the Lotline Android app, which opens the same site. {OPERATOR} runs Lotline. You can plan without an account, and every upload is an action you choose.</p>} />;
}
