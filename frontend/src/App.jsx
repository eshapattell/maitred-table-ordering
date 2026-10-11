// App.jsx: Root application component configuring router, auth context, and shell layout
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import Navbar from "./Components/Common/Navbar.jsx";
import AppRoutes from "./routes/index.jsx";

export const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <Navbar />
      <main className="page">
        <AppRoutes />
      </main>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
