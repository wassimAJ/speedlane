# Library Card Chaos design system

This document turns the Amazon 2.0 product direction into rules for maintaining
one coherent frontend visual language. The public landing page may be
theatrical; authenticated surfaces must stay calm, dense, and fast to scan.

Amazon 2.0 is an independent library demo. Its name is a joke, but its visual
identity must not imitate Amazon: do not use a smile/arrow mark, shopping cart,
Amazon-like orange and black, or Amazon typography and trade dress.

## Design principles

1. **Library material, digital clarity.** Use paper, ink, catalogue rules,
   stamps, and typographic covers as cues. Keep controls familiar and semantic.
2. **Covers lead; metadata serves.** A cover is the visual anchor. Title,
   author, year, rating, and genres remain readable and consistently ordered.
3. **Expression has boundaries.** Fraunces, skew, overlapping paper, and
   off-register details belong in display moments. Forms, results, and tables
   align to a regular grid.
4. **State is never a mystery.** Loading, active filters, result counts, errors,
   empty results, saved actions, and unavailable records are explicitly named.
5. **Mobile is a composition, not a crop.** At 320px, actions remain visible,
   controls remain labelled, and nothing requires horizontal page scrolling.
6. **The URL is part of the interface.** Catalogue search, filters, sort, page,
   and page size are represented in the URL and restored by back/forward
   navigation.

## Foundations

### Colour tokens

Use CSS custom properties at `:root`. The four product colours are the core;
the remaining colours are functional extensions, not a competing palette.

| Token | Value | Use |
| --- | --- | --- |
| `--color-paper` | `#F6F1E4` | Page background and quiet controls |
| `--color-paper-raised` | `#FFFDF7` | Inputs, drawers, menus, and raised sheets |
| `--color-ink` | `#1B1B1B` | Primary text, icons, and strong borders |
| `--color-brown` | `#6B5844` | Secondary text and catalogue metadata |
| `--color-library-red` | `#C43D32` | Brand mark, primary action fill, selected accents |
| `--color-library-red-dark` | `#8E2922` | Small red text, errors, active links, focus ring |
| `--color-success` | `#245B45` | Confirmed/saved text and icons |
| `--color-info` | `#2D5684` | Neutral status and informational links |
| `--color-rule` | `#8B7964` | Input outlines and important dividers |
| `--color-rule-soft` | `#D8CEBD` | Card and section rules; never the only control boundary |
| `--color-paper-muted` | `#E8E0D1` | Disabled surfaces and skeletons |
| `--color-scrim` | `rgb(27 27 27 / 68%)` | Drawer and modal backdrop |

Approved high-use contrast pairs:

| Foreground / background | Contrast | Rule |
| --- | ---: | --- |
| Ink / paper | `15.27:1` | Default text pair |
| Brown / paper | `6.00:1` | Secondary text pair |
| Library red / paper | `4.59:1` | Passes AA; reserve for large accents and short labels |
| Library red dark / paper | `7.48:1` | Small red text, errors, and focus |
| White / library red | `5.17:1` | Primary button pair |
| Success / paper | `7.01:1` | Saved state pair |
| Info / paper | `6.71:1` | Informational text pair |

Do not put ink or brown text on library red; those combinations fail normal
text contrast. Use white text on library red. Information must never depend on
red, green, or any colour alone: pair colour with text, shape, icon, or state.
Decorative soft rules do not need text contrast, but interactive boundaries do.

Paper is the default canvas. Avoid large pure-white application backgrounds,
glossy gradients, glass effects, and generic grey card grids. A subtle
CSS-created paper grain is allowed only when it remains invisible at normal
reading distance and does not reduce text contrast.

### Typography

The web bundle supplies Fraunces Variable and IBM Plex Mono through Fontsource.
Keep them bundled with the application, retain swap behavior, and preserve the
fallbacks below so the layout remains usable before fonts load.

```css
--font-display: "Fraunces Variable", Georgia, "Times New Roman", serif;
--font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-utility: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
```

- **Fraunces** is for the wordmark, page titles, section titles, book titles in
  editorial/detail contexts, and large empty-state headings. Use weight 600 or
  700. Do not set form labels, long body copy, or all card metadata in it.
- **System sans** is for paragraphs, synopsis text, navigation, and longer
  instructional copy. It keeps dense authenticated screens easy to read.
- **IBM Plex Mono** is the catalogue utility face: labels, buttons, input text,
  badges, result counts, pagination, years, ratings, ISBNs, and status text.
  Use weight 400, 500, or 600; never synthesize bold.

| Style | Size / line-height | Weight | Family | Use |
| --- | --- | ---: | --- | --- |
| `display-xl` | `clamp(3rem, 8vw, 6rem) / 0.92` | 700 | Display | Landing wordmark only |
| `heading-1` | `clamp(2rem, 5vw, 3.25rem) / 1.02` | 650 | Display | Page title |
| `heading-2` | `clamp(1.625rem, 3vw, 2.25rem) / 1.1` | 650 | Display | Major section title |
| `heading-3` | `1.25rem / 1.2` | 650 | Display | Card group/detail subsection |
| `body-lg` | `1.125rem / 1.55` | 400 | Body | Introductory copy |
| `body` | `1rem / 1.55` | 400 | Body | Synopsis and instructions |
| `utility` | `0.875rem / 1.4` | 500 | Utility | Controls and metadata |
| `utility-sm` | `0.75rem / 1.35` | 500 | Utility | Short badges and eyebrow labels |

Keep prose between 45 and 70 characters per line. Inputs use at least `1rem`
text to avoid mobile browser zoom. Uppercase is limited to short utility labels
of roughly 20 characters or fewer, with `0.06em` letter spacing. Never uppercase
a book title, author, error, or paragraph.

### Spacing, size, and shape

Use a four-pixel base. These are the only general spacing tokens:

```css
--space-1: 0.25rem;  /* 4 */
--space-2: 0.5rem;   /* 8 */
--space-3: 0.75rem;  /* 12 */
--space-4: 1rem;     /* 16 */
--space-6: 1.5rem;   /* 24 */
--space-8: 2rem;     /* 32 */
--space-12: 3rem;    /* 48 */
--space-16: 4rem;    /* 64 */
--space-24: 6rem;    /* 96 */
```

- Minimum interactive target: `44px × 44px`; default input and button height:
  `48px`.
- Default control radius: `2px`; sheet/drawer radius: `6px`; book covers:
  `2px`. Pills are reserved for removable filter chips and compact statuses.
- Default border: `1px solid var(--color-rule-soft)`; interactive control
  border: `2px solid var(--color-rule)`.
- Material shadow: `3px 4px 0 rgb(27 27 27 / 16%)`. Use it only for covers,
  menus, drawers, and modals—not every result container.
- Use solid rules and spacing, rather than boxed cards, to divide catalogue
  sections.

### Responsive frame

All layouts are mobile-first. Breakpoints describe when content earns more
space; they are not device names.

| Width | Outer gutter | Layout behavior |
| --- | ---: | --- |
| `320–479px` | `16px` | Compact header, filter drawer, one-column horizontal book rows |
| `480–767px` | `20px` | Two-column vertical book cards where content permits |
| `768–1023px` | `24px` | Full navigation, three-column results, filters still in drawer |
| `1024–1279px` | `32px` | Persistent `240px` filter rail plus three-column results |
| `1280px+` | `40px` | `256px` filter rail plus four-column results |

The authenticated content frame has a maximum width of `1440px` and is centred.
Grid gaps are `16px` below 768px, `24px` from 768px, and `32px` from 1280px.
Never make the root page horizontally scroll. At 200% zoom, switch to the
appropriate narrower composition rather than preserving columns.

## Authenticated application shell

The shell has three landmarks in order: skip link, header/navigation, and
`main`. Add a footer only when it contains useful product or legal information.

### Header

- Paper background, one dark bottom rule, no oversized hero treatment.
- The Amazon 2.0 wordmark uses Fraunces plus one intentionally offset red
  library-card rectangle. It must not use a curved arrow or cart motif.
- Desktop order: wordmark, primary navigation (`Catalogue`, `My Shelf`, and
  librarian-only `Back Room`), flexible spacer, user menu.
- The current destination uses both an underline/block marker and
  `aria-current="page"`; colour alone is insufficient.
- At 320–767px, show wordmark, current destination, and one labelled `Menu`
  button. The opened menu is a disclosure or modal sheet with all destinations
  and `Sign out` as text, not an icon-only action.
- Header actions remain at least 44px high. Do not hide core navigation behind
  hover behavior.

### Page header

Use an optional utility eyebrow, one `h1`, and at most one sentence of support
copy. For the catalogue:

- Eyebrow: `THE OPEN STACKS`
- Heading: `Find your next book`
- Support: `Search the active collection by title or author.`

Keep controls out of the `h1` row at narrow widths. On desktop, a quiet result
count may align to the lower edge of the page header.

## Authenticated catalogue composition

The catalogue is one coherent browsing workspace, not a dashboard of unrelated
cards.

1. Application header.
2. Page header.
3. Optional `For your shelves` section, only when the signed-in reader has
   active favourite genres.
4. Search row.
5. Catalogue workspace: filter rail/drawer followed by result region.
6. Pagination and page-size control.

### Search and URL behavior

- Visible label: `Search by title or author`.
- Placeholder: `Try Octavia Butler`.
- Provide a text `Search` button. Submit on Enter or button activation; do not
  request on every keystroke.
- Search covers title and author only. UI copy must never imply synopsis, ISBN,
  genre, or full-text search.
- The URL is authoritative for `q`, `genre`, `yearFrom`, `yearTo`, `sort`,
  `page`, and `pageSize`. Populate controls from validated URL values.
- A search or filter submission, sort change, or page-size change returns to
  page 1. Pagination changes only `page`.
- Browser back/forward restores the controls and results without losing the
  current shell.
- `Reset all` clears search and filters, restores `Newest`, page 1, and 24 per
  page. When no non-default state exists, render it disabled rather than hide
  it and shift the layout.

### Filters and sort

Filter order is fixed:

1. Active genre select/list, with `All genres` first.
2. Publication year group with `From year` and `To year` numeric inputs.
3. `Apply filters` primary action.
4. `Reset all` quiet action.

Use only active genres supplied by the API. Do not embed the seeded genre names
in frontend code. Keep labels visible after values are entered. Invalid year
ranges are shown next to the group and announced; do not send a known-invalid
request.

The result toolbar contains:

- Result summary: `Showing 1–24 of 117 books`.
- Mobile filter trigger: `Filters` plus a count, for example `Filters (2)`.
- Sort select labelled `Sort by`, with exactly `Newest`, `Title A–Z`, and
  `Highest rated`.

At widths below 1024px, filters open in a labelled modal drawer. It occupies the
full viewport at 320–479px and no more than `400px` from 480px. Trap focus while
open, close on Escape, provide an explicit `Close filters` button, prevent page
scroll behind it, and restore focus to the trigger. Values are staged until
`Apply filters`; closing the drawer does not silently apply them.

At 1024px and above, the filter rail is persistent and sticky only while its
full content fits in the viewport. Otherwise it scrolls normally. The desktop
form still uses explicit `Apply filters`, keeping behavior consistent with the
drawer.

### Result grid and book summary

Use a semantic list. Each item is one book summary; do not wrap every field in
separate interactive elements.

- At 320–479px, use a horizontal row: a `104px`-wide cover, then flexible
  metadata. Allow the title to wrap; do not force a card wider than the screen.
- At 480px and above, use vertical cards with equal-width grid tracks. Covers
  fill the track at a fixed `2 / 3` aspect ratio.
- Metadata order: title, author, year and rating, then genres.
- The cover and title navigate to one detail destination. If both are links,
  give the cover link an accessible name and remove redundant tab stops where
  practical. Never nest a button inside a link.
- Show the numerical rating as, for example, `4.6 ★`, with accessible text
  `Rated 4.6 out of 5`. A star alone is not a label.
- Genre chips are informational in a summary. Show up to two and a final
  `+2 more` text when space is tight; expose the complete genre list to
  assistive technology.
- Titles may wrap to three lines in vertical cards. Keep the full title in the
  accessible name; do not rely on a tooltip to reveal it.
- Do not show internal IDs, archive timestamps, cover seeds, database dates,
  or relationship records. `coverSeed` is rendering input, never visible copy.
- Reader-facing catalogue responses contain active books only. Do not render
  archive affordances or infer archival state in this surface.

Generated cover art uses the seed deterministically, a `2 / 3` ratio, large
typographic forms, and the core palette plus muted supporting hues. It must not
load external stock imagery. Keep essential text such as title and author in
HTML outside the cover so a decorative cover can use `alt=""`. If the cover
itself conveys title/author, use concise alt text and avoid announcing the same
words twice.

### `For your shelves`

This section is absent—not empty—when the reader has no active favourite
genres. The catalogue first checks the saved preference list and requests
personalised books only when at least one favourite is active.

- Heading: `For your shelves`.
- Support: `Fresh picks from your favourite corners of the library.`
- Show at most six active books not already on the reader's shelf.
- Preserve server order: preference order, then newest within each genre.
- Use the same book-summary component and cover proportions as ordinary
  results. The as-built grid is one column at the base width, two from 480px,
  three from 768px, and six compact summaries from 1024px.
- Keep loading, request failure with `Try again`, and `No fresh picks are
  available right now.` inside the labelled section. A failure to check whether
  favourites exist uses a compact catalogue notice rather than an empty
  recommendation section.
- Personalised results never alter the ordinary catalogue's order or count.

### Pagination

- Place pagination after the result list in document order.
- Label the region `Catalogue pages`.
- Include `Previous`, the useful nearby page numbers, current page, and `Next`.
  Mark the current page with `aria-current="page"` and a non-colour marker.
- At 320px, use `Previous`, `Page 3 of 12`, and `Next`; do not squeeze many page
  numbers into one line.
- Disable unavailable directions with native `disabled` semantics. Do not make
  them focusable links to the same page.
- Page-size label: `Books per page`; options may include 12, 24, and 48, with
  24 as default and 48 as the maximum.
- On page change, move focus to the result heading or focusable result summary,
  not the top of the document. Announce the new result summary politely.

## Book detail composition

The reader detail route exposes only an active book. An archived, unknown, or
otherwise unavailable book uses the same reader-facing not-found treatment and
must not reveal archive status.

- Start with a `Back to catalogue` link that preserves the prior catalogue
  query when navigated from results.
- At 320–767px: cover first (maximum `240px` wide), then title and metadata,
  then primary shelf action, synopsis, and publication facts.
- At 768px and above: a cover column of `minmax(220px, 320px)` and a flexible
  content column. Keep the action near title/metadata rather than after a long
  synopsis.
- Information order: title, optional subtitle, author, genres, rating, shelf
  action, synopsis, then ISBN, publication year, page count, and language.
- Use a definition list for publication facts. Do not style it as an editable
  form.
- ISBN stays text, not a link unless a real destination is implemented.
- Genre links return to the catalogue with the selected genre filter.
- While shelf membership is loading, show `Checking My Shelf…`. A book that is
  not on the shelf has one `Add to My Shelf` action; adding creates a
  `Want to read` entry.
- A book already on the shelf has a labelled reading-status select with
  `Want to read`, `Reading`, and `Finished`, plus `Remove from My Shelf`.
  Disable the controls while a mutation is in flight and retain their layout.
- Successful add, move, and remove actions write adjacent polite status text.
  Shelf-control load or mutation failures stay local to the control group and
  offer `Try again` when a retry is possible.

Unavailable detail copy:

- Heading: `This book is not available.`
- Body: `It may have moved out of the open stacks.`
- Action: `Back to catalogue`

Do not say `archived` on the reader detail not-found view. My Shelf deliberately
uses the explicit `Archived / unavailable` label for preserved reading history.

## Reader preferences and My Shelf

### Favourite genres

Favourite genres is an authenticated destination in primary navigation. It
uses active genres from the API and displays selection and preference order as
two related sections, not a card dashboard.

- Heading: `Favourite genres`; support: `Choose up to five active genres. Their
  order shapes your personalised picks.`
- The genre fieldset uses large labelled checkboxes and reports `n of 5
  selected`. At five selections, keep selected items enabled for removal,
  disable the remaining choices, and show `Maximum selected. Remove one genre
  to choose another.` as status text.
- The ordered list numbers each saved choice. `Move up` and `Move down` are
  visible text buttons with genre-specific accessible names; disable the
  impossible first/last move.
- At base widths the two sections stack and ordering actions occupy their own
  row. At 768px, selection and order form two proportional columns; active
  genre choices may use two columns without changing DOM order.
- `Save favourites` is disabled while unchanged or saving. A successful save
  announces `Favourite genres saved.` politely. Selection and request errors
  are adjacent, textual, and do not discard the working order.
- When there are no active genres, state that explicitly instead of rendering
  stale or hard-coded choices. The load failure view offers `Try again`.

### My Shelf

My Shelf groups visible entries under `Want to read`, `Reading`, and `Finished`.
Omit an empty group, but keep the total book count in the page header.

- Each row uses a compact deterministic cover, title, author, and controls. The
  base layout uses an `88px` cover and one flexible content track; from 768px,
  use a `104px` cover and separate metadata/action columns.
- Available titles link to detail. Their labelled status select updates the
  reading state and `Remove` soft-removes the entry from the visible shelf.
- An archived book remains in its saved group, loses its detail link, gains a
  dark-red left rule plus the text-and-symbol label `Archived / unavailable`,
  and has its reading-status select disabled. `Remove` remains available.
- Place successful mutation feedback in a polite live region above the groups.
  Name errors with the affected title and keep the current shelf visible.
- Empty-state copy is `Your shelf is ready for a first book.` with the action
  `Browse the catalogue`.

## Reusable component rules

### Buttons and links

| Variant | Treatment | Use |
| --- | --- | --- |
| Primary | Library red fill, white utility text, 2px red border | One main action per local group |
| Secondary | Paper-raised fill, ink text, 2px ink border | Alternate or Back/Cancel actions |
| Quiet | No fill, dark-red or ink text, persistent underline | Reset and low-emphasis actions |
| Destructive | Paper-raised fill, dark-red text and border | Archive/Remove confirmations only |

Pressed states offset by `1px` and remove the material shadow; disabled states
retain readable labels, use `opacity: 0.55`, and cannot be activated. Hover may
strengthen a border but is never the sole indicator. Icon-only controls are
limited to universally understood close/menu actions and still require an
accessible name.

### Inputs, selects, and field groups

- Every input has a persistent text label. Placeholder text is an example, not
  a label.
- Use paper-raised fill, 2px rule border, 48px minimum height, 12px horizontal
  padding, and 16px input text.
- Supporting text precedes error text in the accessibility description order.
- Invalid fields use a dark-red border, an icon or `Error:` prefix, and adjacent
  message. Set `aria-invalid="true"` and connect the message with
  `aria-describedby`.
- Required status is communicated in the label and form introduction, not by
  colour or an unexplained asterisk alone.
- Do not clear user input after a server error.

### Filter chips and statuses

Active filter chips use paper-raised fill, an ink border, full text, and a
44px remove target labelled for the value, such as `Remove Fantasy filter`.
Status chips include both words and a small shape/icon. Never place long errors
or instructions inside chips.

### Drawers, menus, dialogs, and notices

- Use native dialog behavior where support is reliable, or reproduce its
  labelling, focus containment, Escape handling, and focus return.
- The heading names the surface (`Filters`, `Archive book`). Close controls
  have a visible label at 320px.
- Confirmation copy names the record and explains reversibility. The product
  says `Archive` or `Remove`, never `Delete`.
- Inline notices sit near the affected section. Global transient feedback uses
  a non-blocking status region; errors use an alert only when immediate
  interruption is necessary.

### Librarian Back Room

Back Room appears in primary navigation only for librarians. Server
authorization remains authoritative; a reader who reaches its route sees the
in-shell `That room is for librarians.` state and no management request is made.

- `Books` and `Genres` are separate labelled navigation destinations. Each has
  `Active` and `Archived` tabs with `aria-current="page"`; keep these controls
  visible rather than combining record type and status in one select.
- The active tab pairs its status navigation with `Add book` or `Add genre`.
  Archived tabs replace create/edit/archive controls with text-labelled
  `Restore` actions.
- Records use real tables inside named, focusable horizontal-scroll regions.
  Book columns are Book, ISBN, Year, Genres, and Actions; genre columns are
  Name, Slug, and Actions. Keep actions in the table and reachable through
  scrolling; never remove them at narrow widths.
- Create/edit forms are paper-raised sheets with a dark rule and restrained red
  offset shadow. Fields form one column at the base width and two columns from
  600px where related values fit. Synopsis, title/subtitle, genre choices, and
  action rows span the full form width.
- The book form exposes title, optional subtitle, author, synopsis, ISBN,
  publication year, page count, language, rating, cover seed, and one or more
  active genres. The genre form exposes name and slug. Keep hints and adjacent
  errors programmatically associated; the focusable error summary links back
  to invalid controls.
- `Archive` opens a labelled modal naming the record and stating that the
  action is reversible. Focus starts on `Cancel`, Tab stays within the dialog,
  Escape cancels when idle, and closing returns focus to the archive trigger.
- Successful create, update, archive, and restore messages use a polite status
  notice. Archive failures—including a genre that is the only active genre for
  a book—remain visible as server-authored explanatory errors. Never relabel a
  soft archive as delete.

## Interaction and motion

Only these three intentional motions are permitted:

1. **Cover lift:** on hover-capable pointers, a cover translates `-3px` and its
   shadow deepens over `140ms` with an ease-out curve. Keyboard focus uses the
   focus ring without requiring the lift.
2. **Reading-list saved feedback:** a check/stamp appears once over `180ms`,
   accompanied by persistent status text such as `Saved to My Shelf`.
3. **Filter-result transition:** existing results fade to `0.65` opacity over
   `100ms`; replacement results return to full opacity over `160ms`. Preserve
   space to avoid layout jumps.

No drawer slide, menu bounce, parallax, auto-rotating content, skeleton shimmer,
or decorative looping animation. Under `prefers-reduced-motion: reduce`, remove
transforms and transitions; swap content and saved state instantly while
retaining text feedback. Motion never delays data, focus, or input.

## State model and copy

Reserve enough space for expected state changes so controls and headings do not
jump. Loading and error states occupy the result region beneath unchanged
search/filter controls.

| State | Presentation | Suggested copy/action |
| --- | --- | --- |
| Initial catalogue loading | 6–8 static cover/metadata skeletons; result summary says `Loading books…` | No shimmer; mark skeletons hidden from assistive technology |
| Filter/page transition | Keep old layout at reduced opacity; set results region busy | Polite status: `Updating the catalogue…` |
| Results loaded | Remove busy state and announce the count once | `Showing 1–24 of 117 books` |
| No matching results | Small typographic empty state in the result region | `No books found in that stack.` / `Try a shorter search or clear a filter.` / `Reset all` |
| Catalogue request failed | Inline error notice, controls remain usable | `We couldn’t load the shelves.` / `Check your connection and try again.` / `Try again` |
| Genre request failed | Filter-specific notice; do not invent cached genres | `Genres are unavailable right now.` / `Try again` |
| Invalid URL query | Normalize to safe defaults and replace the malformed URL; do not show raw Zod details | `Some catalogue options were reset.` |
| Invalid year range | Adjacent field-group error; do not submit | `The “from” year must be earlier than or equal to the “to” year.` |
| Empty active catalogue | Page-level empty state | `The open stacks are empty.` / `Check back after the librarian adds a book.` |
| Detail loading | Static cover and text skeleton in final layout | Page title status: `Loading book…` |
| Detail unavailable/404 | Reader-safe not-found state | `This book is not available.` / `It may have moved out of the open stacks.` / `Back to catalogue` |
| Favourite limit reached | Leave selected choices enabled and disable only unselected choices | `Maximum selected. Remove one genre to choose another.` |
| Favourite save failed | Preserve selection/order and place an alert by the save action | `We couldn’t save your favourite genres. Try again.` |
| Personalised picks unavailable | Keep ordinary catalogue results independent and usable | `We couldn’t load your personalised picks.` / `Try again` |
| Empty My Shelf | Page-level invitation with catalogue link | `Your shelf is ready for a first book.` / `Browse the catalogue` |
| Archived shelf entry | Keep history visible; disable status and retain Remove | `Archived / unavailable` |
| Back Room archive confirmation | Labelled focus-trapped modal naming the record | `This action is reversible.` / `Cancel` / `Archive` |
| Session expired/401 | Clear authenticated view and move to sign-in route | `Your library card expired. Sign in again to continue.` / `Sign in` |
| Forbidden/403 | Preserve shell, replace protected content | `That room is for librarians.` / `Back to catalogue` |
| Unexpected error | Calm page-level recovery | `Something slipped between the shelves.` / `Try again` |
| Saved to shelf | Status text near action plus polite live message | `Saved to My Shelf` |

Never show stack traces, Prisma errors, internal IDs, raw validation objects, or
archive timestamps. Avoid jokey copy when the user could have lost work or
needs to understand an authorization failure.

## Accessibility requirements

- Meet WCAG 2.2 AA for contrast, keyboard operation, focus visibility, target
  size, reflow, labels, names, roles, and state. Test at 320px and at 200% and
  400% browser zoom.
- The first focusable item is a visible-on-focus `Skip to main content` link.
- Focus style: `3px solid var(--color-library-red-dark)` with a `2px` paper
  offset. For red or dark surfaces, use a white inner ring plus dark outer ring.
  Never remove focus outlines without an equally visible replacement.
- DOM and visual order match. Headings descend logically, with one `h1` per
  view. Lists, navigation, forms, definitions, and tables use their native
  semantics.
- Every actionable icon has an accessible name. Decorative cover marks and
  icons are hidden from the accessibility tree.
- Use `aria-live="polite"` for result counts and saved feedback; use
  `role="alert"` sparingly for blocking validation or failed submission. Do not
  announce every skeleton or every search keystroke.
- When results update, maintain focus unless the user changed page. Opening and
  closing overlays manages and restores focus as described above.
- Touch targets are at least 44px even when their visible icon is smaller.
  Pointer gestures always have a click/tap alternative.
- Content and controls remain usable with images, custom fonts, colour, motion,
  or CSS background textures unavailable.
- In Windows forced-colours mode, preserve native control borders and use
  `Canvas`, `CanvasText`, `LinkText`, and `Highlight` where custom colours would
  disappear.
- Error summaries link to invalid fields for multi-field forms. Individual
  error messages sit next to their fields and are programmatically associated.

## Content style

The voice is warm, direct, and lightly bookish. Library metaphors may make an
empty state memorable, but labels and recovery actions stay literal.

- Prefer `Search`, `Apply filters`, `Reset all`, `Try again`, `Sign in`, and
  `Back to catalogue` over clever action labels.
- Say `book`, `genre`, `My Shelf`, and `Back Room` consistently.
- Use `Archive` and `Restore` for librarian records and `Remove` for a reader's
  shelf relationship. Never use `Delete`.
- Do not call ratings reviews; user reviews are out of scope.
- The public disclaimer is: `Amazon 2.0 is an independent library demo and is
  not affiliated with Amazon.`

## Ordered frontend implementation and regression checklist

1. **Keep the foundations centralized.** Maintain colour, type, spacing,
   radius, border, shadow, width, and focus tokens; bundled Fraunces and IBM
   Plex Mono; global paper/ink defaults; fallbacks; and the skip link.
2. **Protect the authenticated shell.** Preserve semantic navigation,
   librarian-only Back Room visibility, responsive menu, current-route marker,
   main landmark, sign-out feedback, session-expired handling, and 320px
   keyboard behavior.
3. **Keep catalogue query state reliable.** Parse and normalize URL state with
   the shared Zod contract; preserve submit/reset, back/forward restoration,
   page-reset rules, and safe malformed-query handling.
4. **Reuse the established controls.** Use the same buttons, labelled
   inputs/selects, field errors, notices, drawer/dialog behavior, result status,
   and focus treatment across reader and librarian surfaces.
5. **Keep active taxonomy dynamic.** Catalogue filters, favourite choices, and
   book forms consume active genres from the API; no seeded genre is hard-coded.
6. **Preserve complete catalogue states.** Retain static skeletons, busy
   transition, loaded summary, no-match, empty-catalogue, retryable error, 401,
   and unexpected-error treatments.
7. **Maintain one book-summary language.** Use deterministic 2:3 covers and the
   title/author/year/rating/genre hierarchy in ordinary and personalised
   results; never expose `coverSeed` or internal fields as copy.
8. **Regression-test responsive catalogue behavior.** Cover the base horizontal
   result row, wider vertical grids, persistent desktop rail, mobile filter
   drawer, stable updates, pagination capped at 48, focus after page changes,
   and browser history.
9. **Protect detail and shelf integration.** Preserve the catalogue return
   query, reader-safe archived/unknown 404, add/update/remove shelf controls,
   mutation feedback, and publication-facts definition list.
10. **Protect favourite genre ordering.** Keep the five-genre cap, active-only
    choices, explicit move controls, unchanged-save state, ordered payload, and
    error recovery without losing the working selection.
11. **Keep personalisation separate.** Omit `For your shelves` with no
    favourites; otherwise preserve its at-most-six server order and keep its
    loading/error/empty states independent from ordinary catalogue results.
12. **Protect My Shelf history.** Group visible entries by reading state,
    update available entries, soft-remove on request, and keep archived entries
    labelled and removable while their status controls remain disabled.
13. **Protect librarian management.** Keep role gating, Books/Genres and
    Active/Archived navigation, complete forms and validation summaries,
    focusable scrolling tables, reversible archive dialogs, restoration, and
    blocking genre-archive explanations.
14. **Run accessibility and responsive regression checks.** Cover 320, 480,
    768, 1024, and 1280px; keyboard-only operation; screen-reader names/status;
    200% and 400% zoom; forced colours; reduced motion; slow/failing requests;
    long content; session expiry; reader-safe archive behavior; and dialog
    focus return. Record manual checks when performed; this document alone is
    not certification that they passed.

## Design risks to keep under regression

- Bundled Fraunces and IBM Plex Mono loading, fallbacks, and layout shift need
  measurement when asset or build configuration changes.
- Generated covers need a constrained palette/pattern algorithm so a large grid
  feels varied without making titles unreadable.
- Rating precision and generated-cover extremes need checking against the
  seeded data so summary metadata stays aligned without exposing rendering
  inputs such as `coverSeed` as visible copy.
- Long translated titles, author names, and genre sets should be tested with
  real seeded extremes before fixing card heights.
- Dense Back Room tables and long error explanations need narrow-width,
  keyboard-scroll, and focus-return regression checks whenever columns or
  actions change.
