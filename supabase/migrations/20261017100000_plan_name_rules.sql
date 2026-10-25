-- Plan names follow the rules display names already have: no links or URL-like
-- text, no invisible formatting or bidi control characters, 1 to 60 characters,
-- trimmed. A shared plan carries its saved plan's name into the gallery, its
-- page and link previews, so the name is the one free text a member can put in
-- front of other members. The application checks the same rules
-- (lib/domain/plan-name.ts) before a plan is saved and before a name is shown.
--
-- NOT VALID: rows saved before this migration are not re-checked, so applying
-- it cannot fail on an existing name; new rows are checked. Once existing names
-- have been reviewed, an operator may run
--   alter table public.lotline_contribution_plans validate constraint lotline_contribution_plans_name_check;
alter table public.lotline_contribution_plans drop constraint if exists lotline_contribution_plans_name_check;
alter table public.lotline_contribution_plans add constraint lotline_contribution_plans_name_check check (
  char_length(name) between 1 and 60
  and name = btrim(name)
  -- C0 and C1 controls; soft hyphen; Arabic, Syriac and Mongolian format marks; zero-width and
  -- bidi marks (U+200B-U+200F); line and paragraph separators; bidi embeddings and overrides
  -- (U+202A-U+202E); word joiner to nominal digit shapes (U+2060-U+206F); zero-width no-break
  -- space; interlinear annotation marks; and the astral format characters (Kaithi, Egyptian,
  -- Duployan, musical and tag characters).
  and name !~ '[\u0001-\u001F\u007F-\u009F\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890-\u0891\u08E2\u180E\u200B-\u200F\u2028-\u2029\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB\U000110BD\U000110CD\U00013430-\U0001343F\U0001BCA0-\U0001BCA3\U0001D173-\U0001D17A\U000E0001\U000E0020-\U000E007F]'
  and name !~* '(https?|www|://|\.(com|io|xyz|net|org|app|dev)\y)'
) not valid;
