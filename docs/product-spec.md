# Amazon 2.0 product specification

## Purpose

Amazon 2.0 is an independent, playful book-library demo for the Speedlane
take-home. It helps readers discover books and maintain a personal reading list,
while librarians curate the collection. It is not affiliated with Amazon and
does not use Amazon branding or trade dress.

This document is the source of truth for user-facing behaviour. AGENTS.md
defines collaboration and engineering rules; README.md explains how to run the
finished application.

## Users and access

### Visitors

- Can view the public landing page only.
- See what Amazon 2.0 is and exactly six read-only book previews.
- Can navigate to sign in; there is no public registration flow in this
  take-home. Demo credentials are seeded and documented in the README.

### Readers

- Sign in, sign out, and view their current session.
- Browse the full catalogue, search by title or author, filter, sort, paginate,
  and open book details.
- Select up to five favourite genres. Their selected order is stored.
- See a separate **For your shelves** section containing active books from those
  genres. Personalisation never changes the order of ordinary search results.
- Add a book to their personal reading list, then set it to **Want to read**,
  **Reading**, or **Finished**.
- Adding a book creates a **Want to read** entry. Adding a previously removed
  book restores its existing entry and most recently saved state; a reader can
  have only one reading-list entry per book.
- Remove a book from their visible reading list. The relationship is soft
  removed and remains recoverable in the database.

### Librarians

- Have all reader capabilities.
- Open the **Back Room** to create, edit, archive, and restore books.
- Manage the dynamic genre taxonomy: create, edit, archive, and restore genres.
  The seed supplies the initial genres; genres are not a static application
  constant.
- Never permanently delete a record. Archive operations set an archive
  timestamp in persistence and remain reversible.

## Product surfaces

### Public landing page

- Full-bleed, image-led entry point with an unmistakable Amazon 2.0 wordmark, a
  concise explanation, and sign-in call to action.
- Includes a small, visible statement that it is an independent library demo
  and is not affiliated with Amazon. The custom wordmark must not resemble
  Amazon's logo or trade dress.
- A typographic arrangement of generated book covers is the dominant visual.
- The six preview books are the newest active seeded books and reveal only
  basic cover, title, author, and genre information.

### Authenticated catalogue

- Includes a search box, genre filter, publication-year range, sort control,
  pagination, and reset action.
- Search is a case-insensitive partial match against title and author only; it
  does not search synopsis, ISBN, or genres.
- The supported sorts are **Newest** (the default), **Title A–Z**, and
  **Highest rated**. Results use a stable secondary order by book ID.
- The catalogue defaults to page 1 with 24 books per page; page size can be
  changed up to 48 books.
- URL query parameters preserve search, filter, sort, and page state.
- Uses clear loading, empty, and error states.
- Shows **For your shelves** above the ordinary catalogue only when the current
  user has active favourite genres. It contains at most six active books not
  already on the reader's shelf, ordered by the reader's genre-preference order
  and then newest within each genre.

### Responsive behaviour

- The application is designed mobile-first and remains fully usable from a
  320px-wide phone viewport through desktop screens.
- On small screens, primary navigation is compact, filters open in a labelled
  drawer or disclosure, and book results use a readable single-column or
  two-column cover-led layout. Controls retain visible labels and adequate
  touch targets; no core action relies on hover.
- On larger screens, navigation, filters, and results can sit side by side to
  make catalogue browsing efficient. Tables in the Back Room either reflow to
  labelled records or offer horizontal scrolling without hiding actions.
- Forms use a single column on narrow screens and sensible multi-column groups
  only where space permits. Validation errors are announced and placed next to
  their fields.
- Keyboard navigation, visible focus states, semantic controls, sufficient
  colour contrast, and reduced-motion preferences are required at every size.

### Book detail and reading list

- Shows cover, title, subtitle when present, author, synopsis, ISBN,
  publication year, page count, language, rating, and genres.
- Signed-in users can add the book to their reading list or update its reading
  state directly from the detail view.
- **My Shelf** groups visible books by reading state and lets the user update or
  soft-remove an entry.
- If a book is later archived, its existing shelf entry remains visible as
  **Archived / unavailable** to preserve the reader's history. It cannot have
  its state changed, but the reader may still remove it from the visible shelf.

### Librarian Back Room

- Has separate books and genres views with active and archived tabs.
- Book form validates title, author, synopsis, ISBN, publication year, pages,
  language, rating, cover seed, and one or more genres.
- Genre form validates a unique active name and slug.
- Archive actions require confirmation and explain that they are reversible.
- A genre cannot be archived while it is the only active genre for one or more
  active books; the librarian must first assign another active genre to those
  books. Archiving a genre never archives its books.
- Restoring a book or genre returns it to ordinary discovery views.

## Data and API behaviour

The API is versionless under /api; Swagger/OpenAPI documentation is published
at /api/docs.

| Area | Behaviour |
| --- | --- |
| Public discovery | GET /discover returns up to six active book previews. |
| Authentication | Login, logout, and current-session endpoints use an HTTP-only JWT cookie. |
| Catalogue | Authenticated GET /books accepts q, genre, yearFrom, yearTo, sort, page, and pageSize, returning data plus meta. |
| Preferences | GET and PUT /me/favourite-genres read and replace ordered selections, capped at five active genres. |
| Reading list | GET /me/reading-list, PUT /me/reading-list/:bookId, and DELETE /me/reading-list/:bookId read, upsert, and soft-remove entries. |
| Library management | Librarian-only create, update, archive, and restore endpoints manage books and genres. |

Persist users, books, genres, book/genre associations, favourite-genre
preferences, and reading-list entries. Books and genres have archivedAt;
user preference and reading-list relationships have removedAt. Archived books
are hidden from landing, catalogue, and personalisation. Existing reading-list
history remains intact. An archived book returns not found to readers who try
to open it directly, while librarians can access it in the Back Room. Archived
genres are hidden from normal filters and preference selection while their
historical book associations remain intact.

The interface calls destructive-looking actions **Archive** or **Remove**,
never **Delete**. `DELETE` API routes perform only the soft archive/removal
described above.

## Visual and interaction direction

**Library Card Chaos** combines an eccentric public-library catalogue with the
clarity of a useful commerce experience.

- Paper #F6F1E4, ink #1B1B1B, library red #C43D32, and supporting brown
  #6B5844.
- Fraunces is the display face; IBM Plex Mono or Space Mono is the utility face.
- Covers are generated typographic artwork with fixed, book-like aspect ratios;
  no external stock images are required.
- The landing page is expressive. Authenticated screens remain dense, calm, and
  task-oriented rather than becoming a generic card dashboard.
- Responsive layouts prioritise readable type, visible actions, and touchable
  controls over preserving a desktop arrangement on a small screen.
- Use only three intentional motions: cover lift on hover, reading-list saved
  feedback, and filter-result transitions. All motion respects reduced-motion
  preferences.

## Non-goals

- Public sign-up, password reset, email verification, and external identity
  providers.
- User reviews, ratings, comments, recommendations, borrowing, inventory, or
  payments.
- Infinite scrolling, deployment, analytics, and a native mobile app.

## Acceptance criteria

- Docker starts web, API, and PostgreSQL; the seed provides 240 books and demo
  reader/librarian accounts.
- A visitor cannot access the full catalogue or mutation endpoints.
- A reader can set favourite genres, see a personalised section, and manage
  reading-list state.
- A reader cannot manage books or genres; a librarian can.
- Archive/remove actions preserve records and restoration works.
- Search, filtering, sorting, pagination, responsive layouts, forms, and
  Swagger documentation are demonstrable.
- API and UI tests cover role boundaries, catalogue discovery, reading-list
  state, librarian management, and the important validation paths.
