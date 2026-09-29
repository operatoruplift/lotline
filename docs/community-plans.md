# Community plans

Added 28 September 2026 behind `LOTLINE_GALLERY_ENABLED` (off by default). With the flag unset, `/plans`, `/plans/<id>` and `/api/gallery*` answer 404 (the proxy answers before rendering) and no Community link, share control or sheet entry appears. The main browser suite asserts that.

## What members see

- **`/plans`**: a leaderboard of plans members chose to share, ordered by **Most copied** (ranked) or **Newest**, 24 at a time. Each compact row shows the rank, the plan name, "by <display name>" or "by a Lotline member", the copy count, the three largest weights on one line with "+N", a split bar and a **Copy** button. Tapping a row opens the full split in a sheet (a bottom sheet on phones, a side panel on wide screens) with **Copy into my plan** and **Copy link**; the open plan is kept in the URL as `?plan=<id>`, so the view can be reopened.
- **`/plans/<id>`**: the shareable page, with the same detail as the sheet. **Copy link** always copies this address. Link previews carry the plan name and its largest weights only.
- **Copy**: opens the planner's existing shared-plan review dialog with the reader's own draft budget (1,000 USDC when there is none). Nothing changes until they apply it, and nothing is bought. A signed-in member's copy is counted in the background, once per member and never for the author; a guest's copy opens but is not counted.
- **Share to community**: beside each saved cloud plan, with an optional display name (2–32 letters, numbers, spaces, dots, dashes or underscores, no links). Members can share up to five plans, see each one's copy count, and **Stop sharing** at any time. Deleting the saved plan removes the shared copy.

Public pages never show a budget, an owner identity, an email, a wallet, a balance or anyone's activity. Plans are ranked by copies or recency, never by returns, and the gallery says that percentages are each member's own choice, not advice.

## Data

`supabase/migrations/20260928130000_plan_gallery.sql` adds `lotline_published_plans` (a saved-plan reference, display name, copy count, dates) and `lotline_plan_copies` (one row per member per plan). Row-level security with no policies closes both tables to direct REST access; only these `SECURITY DEFINER` functions touch them:

| Function | Who | What |
| --- | --- | --- |
| `lotline_plan_gallery(sort, limit, offset)` | anyone | Name, display name, split, copy count and share date; at most 48 rows |
| `lotline_published_plan(id)` | anyone | One shared plan, same columns |
| `lotline_publish_plan(plan_id, display_name)` | the saved plan's owner | Share or rename; five per member |
| `lotline_unpublish_plan(plan_id)` | the owner | Stop sharing |
| `lotline_record_plan_copy(id)` | signed-in members | Count once per member; never the author |
| `lotline_my_published_plans()` | signed-in members | Their own shares and counts |

Saved plans cannot be edited, so a shared plan can't change silently; its content always matches the saved plan it points to.

## Turning it on

1. Apply `20260928130000_plan_gallery.sql` to the Lotline Supabase project.
2. Set `LOTLINE_GALLERY_ENABLED=true` and redeploy. (Public sign-up still depends on `NEXT_PUBLIC_AUTH_EMAIL_ENABLED`; until then only existing accounts can share, while anyone can browse and copy.)

## Tests

`tests/gallery-database.test.ts` runs every migration in isolated PostgreSQL and checks the public columns, owner-only sharing, display-name rules, once-per-member counting, the five-share limit, paging, cascade on delete and closed tables. `tests/gallery.test.ts` covers the shape, the copy basket and every route. `tests/e2e-markets/gallery.spec.ts` covers ranking, ordering, accessibility, the copy flow into the review dialog, the detail and gone pages, and the 320px layout.
