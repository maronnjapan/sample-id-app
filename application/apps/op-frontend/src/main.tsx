import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Login } from "./components/Login.tsx";
import { Consent } from "./components/Consent.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/interaction/:uid/login" element={<Login />} />
        <Route path="/interaction/:uid/consent" element={<Consent />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)