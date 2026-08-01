import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./components/AppShell";
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
          </Route>
        </Route>
        <Route path="*" element={<Navigate replace to="/catalogue" />} />
      </Routes>
    </AuthProvider>
  );
}
