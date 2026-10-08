import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactLine, LegalPage, type LegalSection } from '@/components/legal/legal-page';
import { OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms for using Lotline: eligibility, risks, non-custody and the Solana dApp Store.',
  alternates: { canonical: '/terms' },
};

const sections: LegalSection[] = [
  { id: 'agreement', title: 'These terms', body: <>
    <p>These terms are an agreement between you and {OPERATOR} (“we”), which runs Lotline at lotline.dev and in the Lotline Android app. By using Lotline you accept them. If you do not accept them, do not use Lotline. Our <Link href="/privacy">privacy policy</Link> explains what we store.</p>
  </> },
  { id: 'dapp-store', title: 'If you got Lotline from the Solana dApp Store', body: <>
    <p>If you obtained Lotline through the Solana dApp Store, these terms are between you and {OPERATOR} only. Solana Mobile is not a party to them. Solana Mobile has no responsibility or liability for Lotline, its content, or its support or maintenance.</p>
  </> },
  { id: 'eligibility', title: 'Who may use Lotline', body: <>
    <ul>
      <li>You must be at least 18 years old.</li>
      <li>You must not be located in, or ordinarily resident in, a country or region under comprehensive sanctions, and you must not be named on a sanctions list or owned or controlled by someone who is.</li>
      <li>You are responsible for following the laws that apply to you, including whether you may hold or trade tokenized stocks where you live.</li>
      <li>The xStocks issuer decides who may hold and trade xStocks. Its eligibility terms at <a href="https://xstocks.com" target="_blank" rel="noopener noreferrer">xstocks.com<span className="sr-only"> (opens in a new tab)</span></a> apply to you. Other issuers set their own terms.</li>
      <li>A wallet allowlist in Lotline is a technical gate for the restricted purchase launch. Being on it does not mean you are eligible under an issuer’s terms or your local law.</li>
    </ul>
  </> },
  { id: 'service', title: 'What Lotline does', body: <>
    <p>Lotline helps you plan contributions to tokenized assets on Solana. It splits a USDC budget across the assets you choose, shows read-only estimates, balances and prices from third parties, and hands your plan to Jupiter. Accounts, reminders and community plans are optional. In-app purchases are a restricted launch for reviewed wallets and are off for everyone else. Features may be added, changed, paused or removed.</p>
  </> },
  { id: 'not-advice', title: 'Not advice', body: <>
    <p>Lotline does not give investment, financial, legal or tax advice. Estimates, prices, charts, examples and community plans are information only. They can be wrong, late or incomplete. Community plans are other members’ own choices, ranked by copies and never by returns. You alone decide whether and what to buy. Consider getting independent advice.</p>
  </> },
  { id: 'non-custodial', title: 'Your wallet, your keys', body: <>
    <p>Lotline is non-custodial. You sign in and approve every transaction in your own wallet. Lotline never holds your private keys, recovery phrase or funds, and cannot move your funds without your wallet’s approval. You are responsible for your wallet, your keys and checking every transaction before you approve it. Transactions on Solana are final. We cannot reverse, cancel or refund them.</p>
  </> },
  { id: 'risks', title: 'Risks you accept', body: <>
    <ul>
      <li><strong>Volatility.</strong> Tokenized stocks and crypto can lose value quickly, and you can lose everything you put in. Tokens can trade while the underlying market is closed, so prices can gap. Past prices do not predict future ones.</li>
      <li><strong>Issuer controls.</strong> A tokenized stock is not the share itself. Your rights come from the issuer’s terms. Issuers can freeze tokens, move them by administrative transfer, pause or halt an asset, change their terms, or stop serving your region.</li>
      <li><strong>Leveraged products.</strong> Some listed assets track leveraged or inverse funds. They are built for short holding periods and can lose value fast, even when the underlying moves your way.</li>
      <li><strong>Smart contracts and networks.</strong> Programs, tokens and the Solana network can have bugs, be exploited, slow down or stop. Transactions can fail, cost fees or land late.</li>
      <li><strong>Third parties.</strong> Lotline relies on services it does not control, including Jupiter, liquidity venues, price sources, RPC providers, issuers, wallets, Supabase and Vercel. They can fail, change or stop.</li>
      <li><strong>Law.</strong> Rules for tokenized assets change and can limit what you may do.</li>
    </ul>
  </> },
  { id: 'accounts', title: 'Accounts and community plans', body: <>
    <p>Keep your sign-in details and wallet safe. You are responsible for what happens under your account. You can delete your account at any time from the Account page.</p>
    <p>If you share a plan, share only a name, display name and split you have the right to share. No spam, advertising, links, impersonation, or offensive or misleading content. You allow us to show your shared plan’s name, display name and split in Lotline until you stop sharing it. Anyone can report a shared plan. A plan reported by three people is hidden until we review it, and we may hide or remove shared plans and suspend accounts that break these terms.</p>
  </> },
  { id: 'use', title: 'Fair use', body: <>
    <p>Do not use Lotline to break the law, evade sanctions or launder money. Do not attack, overload or probe Lotline, get around its rate limits or access controls, or use it to harm others.</p>
  </> },
  { id: 'third-parties', title: 'Other services', body: <>
    <p>Jupiter, your wallet, issuers and other services you reach from Lotline have their own terms and privacy policies. We are not responsible for them.</p>
  </> },
  { id: 'warranty', title: 'No warranty', body: <>
    <p>Lotline is provided “as is” and “as available”. To the fullest extent the law allows, we make no promises or warranties of any kind, express or implied, including that Lotline is accurate, available, secure, error-free, fit for a particular purpose or non-infringing.</p>
  </> },
  { id: 'liability', title: 'Limitation of liability', body: <>
    <p>To the fullest extent the law allows, {OPERATOR} is not liable for any indirect, incidental, special, consequential or punitive damages, or for lost profits, lost funds, lost data or trading losses, arising from your use of Lotline or of any service it connects to, even if we were told they were possible. Our total liability for any claim about Lotline is limited to the greater of the amount you paid us for Lotline in the 12 months before the claim and 100 US dollars.</p>
    <p>Some places do not allow these exclusions or limits. Where that is so, they apply only as far as the law permits, and nothing in these terms limits rights you have that cannot be limited.</p>
  </> },
  { id: 'termination', title: 'Ending use', body: <>
    <p>You can stop using Lotline at any time and delete your account. We may suspend or end your access if you break these terms, if the law requires it, or if we stop offering Lotline. The sections on risks, warranty, liability and governing law continue to apply after that.</p>
  </> },
  { id: 'changes', title: 'Changes to these terms', body: <>
    <p>We may change these terms. When we do, we update this page and its date, and we describe significant changes here before they apply. If you keep using Lotline after a change applies, you accept the new terms.</p>
  </> },
  { id: 'law', title: 'Governing law', body: <>
    <p>These terms are governed by the laws of the place where {OPERATOR} is established, without regard to its conflict-of-law rules. Disputes go to the courts of that place. If the law where you live gives you the right to have local law apply or to bring a claim in your local courts, that right is not affected.</p>
  </> },
  { id: 'contact', title: 'Contact', body: <>
    <ContactLine />
  </> },
];

export default function TermsPage() {
  return <LegalPage eyebrow="TERMS OF USE" title="The terms for using Lotline." sections={sections}
    intro={<p>Please read these terms before you use Lotline. They explain who may use it, the risks of tokenized assets, and what we are and are not responsible for.</p>} />;
}
