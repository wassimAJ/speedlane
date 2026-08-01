import { Link, NavLink } from "react-router-dom";

export function BackRoomHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "back-room-nav__link back-room-nav__link--active" : "back-room-nav__link";

  return (
    <>
      <header className="page-heading back-room-heading">
        <p className="eyebrow">The Back Room · Librarian desk</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <nav aria-label="Back Room sections" className="back-room-nav">
        <NavLink className={navClass} to="/back-room/books">
          Books
        </NavLink>
        <NavLink className={navClass} to="/back-room/genres">
          Genres
        </NavLink>
      </nav>
    </>
  );
}

export function StatusTabs({ section, status }: { section: "books" | "genres"; status: string }) {
  return (
    <nav aria-label={`${section === "books" ? "Book" : "Genre"} status`} className="status-tabs">
      <Link
        aria-current={status === "active" ? "page" : undefined}
        className={status === "active" ? "status-tabs__link status-tabs__link--active" : "status-tabs__link"}
        to={`/back-room/${section}?status=active`}
      >
        Active
      </Link>
      <Link
        aria-current={status === "archived" ? "page" : undefined}
        className={status === "archived" ? "status-tabs__link status-tabs__link--active" : "status-tabs__link"}
        to={`/back-room/${section}?status=archived`}
      >
        Archived
      </Link>
    </nav>
  );
}
