import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import { LibrarianRoute } from "./auth/LibrarianRoute";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./components/AppShell";
import { AdminBooksPage } from "./pages/AdminBooksPage";
import { AdminGenresPage } from "./pages/AdminGenresPage";
import { BookDetailPage } from "./pages/BookDetailPage";
import { CataloguePage } from "./pages/CataloguePage";
import { FavouriteGenresPage } from "./pages/FavouriteGenresPage";
import { MyShelfPage } from "./pages/MyShelfPage";
import { SignInPage } from "./pages/SignInPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/catalogue" element={<CataloguePage />} />
            <Route path="/books/:bookId" element={<BookDetailPage />} />
            <Route path="/preferences" element={<FavouriteGenresPage />} />
            <Route path="/shelf" element={<MyShelfPage />} />
            <Route element={<LibrarianRoute />}>
              <Route path="/back-room" element={<Navigate replace to="/back-room/books" />} />
              <Route path="/back-room/books" element={<AdminBooksPage />} />
              <Route path="/back-room/genres" element={<AdminGenresPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate replace to="/catalogue" />} />
      </Routes>
    </AuthProvider>
  );
}
