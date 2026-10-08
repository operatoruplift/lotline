# Community moderation

Added 7 October 2026 for the Solana dApp Store, whose Publisher Policy asks apps with user-generated content to offer reporting, moderation and blocking. Shared plans are the only user content in Lotline: a plan name, an optional display name and a split.

The controls ship with `supabase/migrations/20261007091000_community_moderation.sql`. Until it is applied, the gallery returns no author keys, and **Report** and **Hide plans from this author** stay out of the interface. Apply it, then check both appear on a shared plan.

## What members see

- **Report.** Every shared plan's sheet and page has **Report**. The reader picks a reason (spam or advertising, misleading name or split, offensive name, something else) and sends it. The answer is the same for a new report and a repeat, so it never says who reported what.
- **Hide plans from this author.** Hides every plan from that author on this device. A note offers **Undo**, and the gallery lists hidden authors with **Show their plans**. A hidden author's plan page says so and offers to show their plans again. The choice lives in `localStorage` (`lotline:hidden-authors:v1`) and is never sent to Lotline.

## How it works

- `lotline_plan_reports` holds one row per report: the shared plan, the reason, the time, and the reporter. A signed-in reporter is their account id. A guest is an HMAC-SHA-256 of their IP address keyed with the server secret, computed by `/api/gallery/report`; the database never sees the address.
- One report per reporter per plan. A reporter can send 10 reports an hour, and all guests together 300 an hour. The route also allows 20 report requests per connection every 10 minutes. Authors cannot report their own plans.
- **Auto-hide.** When a plan has open reports from 3 distinct reporters, it is hidden (`hidden_reason = 'reports'`). Hidden plans leave the gallery, their page answers "no longer shared", and they cannot be copied or reported.
- **Author key.** The gallery and plan APIs return `author_key`: the first 24 hex characters of SHA-256 over a random salt and the author's account id. It is the same for all of an author's plans and cannot be turned back into an account without the salt, which only the database owner can read (`lotline_private.gallery_secrets`). Changing the salt resets every reader's hidden-author list, so leave it alone.
- RLS is on for the new tables with no policies, and no role has table grants. `lotline_report_plan` is executable by signed-in members; `lotline_report_plan_as_guest`, `lotline_hide_published_plan` and `lotline_unhide_published_plan` only by the service role. The database owner (the SQL editor) can run everything.

## Operator SQL

Run these in the Supabase SQL editor for the Lotline project. Replace `<shared plan id>` with the id from a `/plans/<id>` link.

Plans with reports waiting for review, most reported first:

```sql
select published.id, plan.name, published.display_name, published.hidden_reason,
       count(*) as open_reports, array_agg(distinct report.reason) as reasons, max(report.created_at) as last_report
from public.lotline_plan_reports report
join public.lotline_published_plans published on published.id = report.published_id
join public.lotline_contribution_plans plan on plan.id = published.plan_id
where report.reviewed_at is null
group by published.id, plan.name, published.display_name, published.hidden_reason
order by open_reports desc, last_report desc;
```

Hidden plans:

```sql
select published.id, plan.name, published.display_name, published.hidden_at, published.hidden_reason
from public.lotline_published_plans published
join public.lotline_contribution_plans plan on plan.id = published.plan_id
where published.hidden_at is not null
order by published.hidden_at desc;
```

Hide a plan yourself, or keep one hidden that reports already hid:

```sql
select public.lotline_hide_published_plan('<shared plan id>');
```

Restore a plan after review. Its open reports become reviewed, so hiding it again takes three new reporters:

```sql
select public.lotline_unhide_published_plan('<shared plan id>');
```

Every shared plan from the same author:

```sql
select other.id, plan.name, other.display_name, other.hidden_at
from public.lotline_published_plans other
join public.lotline_contribution_plans plan on plan.id = other.plan_id
where other.user_id = (select user_id from public.lotline_published_plans where id = '<shared plan id>');
```

Remove a shared plan for good. The author's saved plan stays; its copies and reports go with it:

```sql
delete from public.lotline_published_plans where id = '<shared plan id>';
```

To remove an author entirely, delete their user under **Authentication → Users**. Every Lotline row they own goes with it (see [accounts](accounts.md#deleting-an-account)).

Reports name their reporters. Do not export them or share them with authors.

## Tests

- `tests/moderation-database.test.ts` runs every migration in isolated PostgreSQL: one report per member and per hashed guest, never the author's own; bad reasons, hashes and callers refused; auto-hide at three distinct reporters across the gallery, the plan, copies and new reports; the hourly report limit; hide and unhide only for the service role or the owner; restoring needs three new reporters; closed tables and salt; stable, salted author keys.
- `tests/gallery-report.test.ts`: the report route stays dark without the gallery flag, refuses other origins and bad input, reports members through their session and guests as a salted hash (never the address), and is rate limited per connection.
- `tests/hidden-authors.test.ts`: the device list and the gallery filter.
- `tests/e2e-markets/gallery.spec.ts`: reporting from the sheet, a refused report, hiding an author with undo, after a reload and on the plan page.
